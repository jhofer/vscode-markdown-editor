import customFence from "markdown-it-container";

export default function notice(md): void {
  customFence(md, "notice", {
    marker: ":",
    validate: () => true,
    render: function(tokens, idx) {
      const { info } = tokens[idx];

      if (tokens[idx].nesting === 1) {
        // opening tag
        return `<div class="notice notice-${md.utils.escapeHtml(info)}">\n`;
      } else {
        // closing tag
        return "</div>\n";
      }
    },
  });

  // Capture how the fences were written — the marker run and info string, the
  // closing fence (empty when the block ran to the end of the file), and the
  // blank lines just inside the block — so the serializer reproduces the
  // source instead of normalising every notice to `:::info`.
  md.core.ruler.push("notices-pm", state => {
    const srcLines = state.src.split("\n");
    const isBlank = (line: number): boolean =>
      (srcLines[line] ?? "").trim() === "";

    // Nested notices close innermost first, so pair the fences with a stack.
    const open: (typeof state.tokens)[number][] = [];

    for (const token of state.tokens) {
      if (token.type === "container_notice_open") {
        const map = token.map;
        if (!map) continue;

        token.meta = {
          ...token.meta,
          markup: token.markup + token.info,
          blankAfterOpen: map[1] > map[0] + 1 && isBlank(map[0] + 1),
          blankBeforeClose: map[1] - 1 > map[0] && isBlank(map[1] - 1),
        };
        open.push(token);
        continue;
      }

      if (token.type === "container_notice_close") {
        // The closing fence's own spelling lives on the close token, and is
        // empty when the block was left unterminated at the end of the file.
        const opener = open.pop();
        if (opener) {
          opener.meta = { ...opener.meta, closeMarkup: token.markup };
        }
      }
    }

    return false;
  });
}
