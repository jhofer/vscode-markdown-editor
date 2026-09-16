/**
 * markdown-it rule to parse HTML `<details>` disclosure blocks, optionally
 * with an `open` attribute and a leading `<summary>` child:
 *
 *     <details open>
 *     <summary>Click me</summary>
 *
 *     Body **markdown**, parsed as usual.
 *
 *     </details>
 *
 * See https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/details
 *
 * The editor runs markdown-it with `html: false`, so without this rule the tags
 * would show up as literal text in the document. The rule is deliberately
 * strict: the opening `<details …>` and the closing `</details>` each have to
 * sit alone on their own line, which is the form every markdown renderer that
 * supports nested markdown inside `<details>` requires anyway. Anything else
 * falls through to the previous behaviour (plain text).
 *
 * The exact opening tags and the blank-line layout of the source are stamped
 * onto `token.meta` so the ProseMirror serializer can reproduce the original
 * spelling instead of normalising it — see nodes/Details.tsx.
 */
import MarkdownIt from "markdown-it";

const DETAILS_OPEN = /^<details(\s[^>]*)?>\s*$/i;
const DETAILS_CLOSE = /^<\/details\s*>\s*$/i;
const SUMMARY_OPEN = /^<summary(\s[^>]*)?>/i;
const SUMMARY_CLOSE = /<\/summary\s*>\s*$/i;

/**
 * HTML boolean attribute semantics: the disclosure is open whenever the
 * attribute is present, whatever its value (`open`, `open=""`, `open="true"`).
 */
export function hasOpenAttribute(openTag: string): boolean {
  const attrs = openTag.replace(/^<details/i, "").replace(/>\s*$/, "");
  return /(^|\s)open(\s|=|$)/i.test(attrs);
}

export default function details(md: MarkdownIt): void {
  const lineText = (state: any, line: number): string =>
    state.src.slice(
      state.bMarks[line] + state.tShift[line],
      state.eMarks[line]
    );

  const rule = (
    state: any,
    startLine: number,
    endLine: number,
    silent: boolean
  ): boolean => {
    // Indented four spaces or more: that's a code block, not a tag.
    if (state.sCount[startLine] - state.blkIndent >= 4) return false;

    const openTag = lineText(state, startLine).trim();
    if (!DETAILS_OPEN.test(openTag)) return false;

    // Find the `</details>` that closes this one, skipping nested blocks and
    // tags quoted inside fenced code.
    let depth = 1;
    let closeLine = -1;
    let fence: string | null = null;
    for (let line = startLine + 1; line < endLine; line++) {
      if (state.sCount[line] - state.blkIndent >= 4) continue;
      const text = lineText(state, line).trim();

      const marker = text.match(/^(`{3,}|~{3,})/);
      if (fence) {
        if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) {
          fence = null;
        }
        continue;
      }
      if (marker) {
        fence = marker[1];
        continue;
      }

      if (DETAILS_OPEN.test(text)) {
        depth += 1;
      } else if (DETAILS_CLOSE.test(text)) {
        depth -= 1;
        if (depth === 0) {
          closeLine = line;
          break;
        }
      }
    }
    if (closeLine === -1) return false;

    if (silent) return true;

    // An optional `<summary>` as the first child. It may span several lines,
    // but has to start on the first line of the block.
    let summaryTag: string | null = null;
    let summaryContent = "";
    let bodyStart = startLine + 1;

    if (bodyStart < closeLine) {
      const firstText = lineText(state, bodyStart);
      const openMatch = firstText.match(SUMMARY_OPEN);
      if (openMatch) {
        for (let line = bodyStart; line < closeLine; line++) {
          // Inline content can't span a blank line, so an unclosed `<summary>`
          // stops here rather than swallowing the rest of the block.
          if (state.isEmpty(line)) break;

          const text = lineText(state, line);
          if (!SUMMARY_CLOSE.test(text)) continue;

          const raw: string[] = [];
          for (let i = bodyStart; i <= line; i++) raw.push(lineText(state, i));
          const joined = raw.join("\n");
          summaryTag = openMatch[0];
          summaryContent = joined
            .slice(summaryTag.length)
            .replace(SUMMARY_CLOSE, "");
          bodyStart = line + 1;
          break;
        }
      }
    }

    const summaryEnd = bodyStart - 1;
    const meta = {
      open: hasOpenAttribute(openTag),
      markup: openTag,
      blankBeforeBody: bodyStart < closeLine && state.isEmpty(bodyStart),
      blankBeforeClose:
        closeLine - 1 > startLine && state.isEmpty(closeLine - 1),
    };

    const token = state.push("details_open", "details", 1);
    token.block = true;
    token.markup = openTag;
    token.map = [startLine, closeLine + 1];
    token.meta = meta;
    if (meta.open) token.attrSet("open", "");

    if (summaryTag !== null) {
      const summaryOpen = state.push("summary_open", "summary", 1);
      summaryOpen.block = true;
      summaryOpen.markup = summaryTag;
      summaryOpen.map = [startLine + 1, summaryEnd + 1];
      summaryOpen.meta = { markup: summaryTag };

      const inline = state.push("inline", "", 0);
      inline.content = summaryContent;
      inline.map = [startLine + 1, summaryEnd + 1];
      inline.children = [];

      const summaryClose = state.push("summary_close", "summary", -1);
      summaryClose.block = true;
    }

    const oldParent = state.parentType;
    const oldLineMax = state.lineMax;
    state.parentType = "details";
    state.lineMax = closeLine;
    state.md.block.tokenize(state, bodyStart, closeLine);
    state.parentType = oldParent;
    state.lineMax = oldLineMax;

    const closeToken = state.push("details_close", "details", -1);
    closeToken.block = true;
    closeToken.markup = "</details>";

    state.line = closeLine + 1;
    return true;
  };

  md.block.ruler.before("paragraph", "details", rule, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
}
