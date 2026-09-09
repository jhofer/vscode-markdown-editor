import MarkdownIt from "markdown-it";

const BREAK_REGEX = /(?:^|[^\\])\\n/;

// Split a raw markdown table row into its cell segments, dropping exactly one
// leading and one trailing pipe. Whitespace inside each segment is preserved so
// the serializer can reproduce the source delimiter row verbatim.
function splitPipeCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|");
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

      tokens[i].meta = { ...tokens[i].meta, padded };
      headCells.forEach((cell, k) => {
        cell.meta = {
          ...cell.meta,
          ...(delimiterOk ? { delimiter: segments[k] } : {}),
        };
      });
    }

    for (let i = tokens.length - 1; i > 0; i--) {
      if (inside) {
        tokens[i].level--;
      }

      // convert unescaped \n in the text into real br tag
      if (tokens[i].type === "inline" && tokens[i].content.match(BREAK_REGEX)) {
        const existing = tokens[i].children || [];
        tokens[i].children = [];

        existing.forEach(child => {
          const breakParts = child.content.split(BREAK_REGEX);

          // a schema agnostic way to know if a node is inline code would be
          // great, for now we are stuck checking the node type.
          if (breakParts.length > 1 && child.type !== "code_inline") {
            breakParts.forEach((part, index) => {
              const token = new Token("text", "", 1);
              token.content = part.trim();
              tokens[i].children?.push(token);

              if (index < breakParts.length - 1) {
                const brToken = new Token("br", "br", 1);
                tokens[i].children?.push(brToken);
              }
            });
          } else {
            tokens[i].children?.push(child);
          }
        });
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
