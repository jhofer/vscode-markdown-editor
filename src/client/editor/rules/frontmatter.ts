import type MarkdownIt from "markdown-it";

/**
 * markdown-it block rule to parse YAML frontmatter blocks.
 *
 * Matches content delimited by `---` at the very start of the document
 * and emits a "frontmatter" block token so the ProseMirror parser can
 * render it like a code block with YAML syntax highlighting.
 */
export default function frontmatterRule(md: MarkdownIt): void {
  md.block.ruler.before(
    "fence",
    "frontmatter",
    function (state, startLine, endLine, silent) {
      // Frontmatter must start at the very beginning of the document
      if (startLine !== 0) return false;

      const pos = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      const firstLine = state.src.slice(pos, max).trim();

      if (firstLine !== "---") return false;

      if (silent) return true;

      let nextLine = startLine + 1;
      let found = false;

      while (nextLine < endLine) {
        const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
        const lineEnd = state.eMarks[nextLine];
        const lineContent = state.src.slice(lineStart, lineEnd).trim();

        if (lineContent === "---") {
          found = true;
          break;
        }
        nextLine++;
      }

      if (!found) return false;

      // Collect content between the delimiter lines (exclusive).
      const contentLines: string[] = [];
      for (let i = startLine + 1; i < nextLine; i++) {
        const lineStart = state.bMarks[i];
        const lineEnd = state.eMarks[i];
        contentLines.push(state.src.slice(lineStart, lineEnd));
      }

      state.line = nextLine + 1;

      const token = state.push("frontmatter", "code", 0);
      token.content = contentLines.join("\n");
      token.block = true;
      token.map = [startLine, nextLine + 1];

      return true;
    },
    {}
  );
}
