import MarkdownIt from "markdown-it";

// An HTML line break inside a table cell (`a<br>b`). A markdown table row must
// stay on one source line, so a hard break in a cell can't be written as the
// usual trailing-spaces newline; `<br>` is the GFM convention for it. The
// parser runs with `html: false`, so markdown-it leaves the tag as plain text
// and it is turned into a real hard break here.
const BREAK_REGEX = /<br\s*\/?>/i;
const BREAK_SPLIT_REGEX = /(<br\s*\/?>)/i;

// Which of the two outer pipes a raw row was written with. Tables may be
// written without them (`a | b` instead of `| a | b |`), and the serializer
// reproduces whichever form the source used.
export type OuterPipes = "both" | "none" | "leading" | "trailing";

// A table nested in a blockquote keeps the quote markers in its source lines
// (token maps point at the original line numbers), so drop that prefix before
// reading the row's shape.
function stripBlockPrefix(line: string): string {
  return line.replace(/^[\s>]*/, "");
}

function outerPipes(line: string): OuterPipes {
  const s = stripBlockPrefix(line).trim();
  const leading = s.startsWith("|");
  const trailing = s.length > 1 && s.endsWith("|") && !s.endsWith("\\|");
  if (leading && trailing) return "both";
  if (leading) return "leading";
  if (trailing) return "trailing";
  return "none";
}

// Split a raw markdown table row into its cell segments, dropping exactly one
// leading and one trailing pipe. Escaped pipes (`\|`) belong to the cell text
// and never split it, matching how markdown-it reads the row. Whitespace inside
// each segment is preserved so the serializer can reproduce the source
// delimiter row verbatim.
function splitPipeCells(line: string): string[] {
  let s = stripBlockPrefix(line).trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.length > 0 && s.endsWith("|") && !s.endsWith("\\|")) {
    s = s.slice(0, -1);
  }

  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") {
      cell += "\\|";
      i++;
    } else if (s[i] === "|") {
      cells.push(cell);
      cell = "";
    } else {
      cell += s[i];
    }
  }
  cells.push(cell);
  return cells;
}

// Whether a table's cells are written padded (`| a | b |`) or tight (`|a|b|`) in
// the source. Falls back to `true` (the historical serializer behaviour) when
// the row can't be classified cleanly.
function looksPadded(headerLine: string, columnCount: number): boolean {
  const cells = splitPipeCells(headerLine);
  if (cells.length !== columnCount) return true;
  const allTight = cells.every(c => c === c.trim());
  const allPadded = cells.every(
    c => c === "" || (/^\s/.test(c) && /\s$/.test(c))
  );
  if (allTight && !allPadded) return false;
  return true;
}

export default function markdownTables(md: MarkdownIt): void {
  // insert a new rule after the "inline" rules are parsed
  md.core.ruler.after("inline", "tables-pm", state => {
    // markdown-it v14 ships lib/token as an ESM-only module, so import the
    // Token class from the parser state instead of a direct subpath import.
    const { Token } = state;
    const tokens = state.tokens;
    let inside = false;

    // Forward pass: capture the exact delimiter row and padding style of every
    // table straight from the source, before the backward pass below rewrites
    // the token stream. Without this the serializer rebuilds `|---|---|` from
    // alignment alone and rewrites the file on open (see churn table in the
    // markdown-roundtrip-fidelity plan).
    const srcLines = state.src.split("\n");
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "table_open") continue;

      const map = tokens[i].map;
      if (!map) continue;

      const headerLine = srcLines[map[0]];
      const delimLine = srcLines[map[0] + 1];
      if (typeof headerLine !== "string" || typeof delimLine !== "string") {
        continue;
      }

      // header cells of the first row
      const headCells: InstanceType<typeof Token>[] = [];
      for (let j = i + 1; j < tokens.length; j++) {
        if (tokens[j].type === "tr_close") break;
        if (tokens[j].type === "th_open") headCells.push(tokens[j]);
      }
      if (!headCells.length) continue;

      const segments = splitPipeCells(delimLine);
      const delimiterOk =
        segments.length === headCells.length &&
        segments.every(s => /^\s*:?-+:?\s*$/.test(s));

      const padded = looksPadded(headerLine, headCells.length);

      tokens[i].meta = {
        ...tokens[i].meta,
        padded,
        pipes: outerPipes(headerLine),
        delimiterPipes: delimiterOk ? outerPipes(delimLine) : undefined,
      };
      headCells.forEach((cell, k) => {
        cell.meta = {
          ...cell.meta,
          ...(delimiterOk ? { delimiter: segments[k] } : {}),
        };
      });

      // Walk the table's rows to record two more things straight from the
      // source: how many cells each row was actually written with (markdown-it
      // pads a short row out to the column count), and the whitespace each cell
      // was written with, so a column-aligned table keeps its alignment instead
      // of being squeezed back to `| a | b |` on open.
      let rowSegments: string[] | null = null;
      let cellIndex = 0;
      for (let j = i + 1; j < tokens.length; j++) {
        const token = tokens[j];
        if (token.type === "table_close") break;

        if (token.type === "tr_open") {
          const rowMap = token.map;
          const rowLine = rowMap ? srcLines[rowMap[0]] : undefined;
          rowSegments =
            typeof rowLine === "string" ? splitPipeCells(rowLine) : null;
          cellIndex = 0;

          if (rowSegments) {
            token.meta = { ...token.meta, cells: rowSegments.length };
          }
          continue;
        }

        if (token.type !== "th_open" && token.type !== "td_open") continue;

        const segment = rowSegments ? rowSegments[cellIndex] : undefined;
        cellIndex++;
        if (segment === undefined) continue;

        const match = /^(\s*)(.*?)(\s*)$/.exec(segment);
        if (!match) continue;

        token.meta = {
          ...token.meta,
          padLeft: match[1].length,
          padRight: match[3].length,
        };
      }
    }

    for (let i = tokens.length - 1; i > 0; i--) {
      if (inside) {
        tokens[i].level--;
      }

      // convert `<br>` in a cell's text into a real hard break
      if (
        inside &&
        tokens[i].type === "inline" &&
        BREAK_REGEX.test(tokens[i].content)
      ) {
        const existing = tokens[i].children || [];
        const children: InstanceType<typeof Token>[] = [];

        existing.forEach(child => {
          // only plain text: `<br>` inside inline code stays literal
          if (child.type !== "text" || !BREAK_REGEX.test(child.content)) {
            children.push(child);
            return;
          }

          child.content.split(BREAK_SPLIT_REGEX).forEach((part, index) => {
            // odd indexes are the captured `<br>` tags themselves
            if (index % 2 === 1) {
              const brToken = new Token("hardbreak", "br", 0);
              brToken.markup = part;
              children.push(brToken);
            } else if (part) {
              const token = new Token("text", "", 0);
              token.content = part;
              children.push(token);
            }
          });
        });

        tokens[i].children = children;
      }

      // filter out incompatible tokens from markdown-it that we don't need
      // in prosemirror. thead/tbody do nothing.
      if (
        ["thead_open", "thead_close", "tbody_open", "tbody_close"].includes(
          tokens[i].type
        )
      ) {
        inside = !inside;
        tokens.splice(i, 1);
      }

      if (["th_open", "td_open"].includes(tokens[i].type)) {
        // markdown-it table parser does not return paragraphs inside the cells
        // but prosemirror requires them, so we add 'em in here.
        tokens.splice(i + 1, 0, new Token("paragraph_open", "p", 1));

        // markdown-it table parser stores alignment as html styles, convert
        // to a simple string here
        const tokenAttrs = tokens[i].attrs;
        if (tokenAttrs) {
          const style = tokenAttrs[0][1];
          tokens[i].info = style.split(":")[1];
        }
      }

      if (["th_close", "td_close"].includes(tokens[i].type)) {
        tokens.splice(i, 0, new Token("paragraph_close", "p", -1));
      }
    }

    return false;
  });
}
