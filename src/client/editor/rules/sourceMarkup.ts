import MarkdownIt from "markdown-it";

/**
 * Forward pass that stamps constructs with the exact source markup that
 * produced them, stored on `token.meta`. The matching node `parseMarkdown()`
 * reads it back into an attr so the ProseMirror serializer can reproduce the
 * source spelling verbatim instead of regenerating it from a hard-coded
 * literal (which rewrites the file the moment it's opened).
 *
 * Covers the spellings that carry no dedicated markdown-it token field:
 * setext heading underlines, the exact fence run + raw info string of a code
 * fence, and the blockquote marker's trailing space. Single-character markers
 * that markdown-it already exposes (`token.markup` for list bullets / ordered
 * delimiters, ATX `#`) are read straight from the token and don't need this.
 *
 * Registered via `Heading.rulePlugins` because Heading is always present in
 * both the headless (`server.ts`) and full (`index.tsx`) extension sets; the
 * pass is construct-agnostic despite its host.
 */
export default function sourceMarkup(md: MarkdownIt): void {
  md.core.ruler.push("source-markup", state => {
    const lines = state.src.split("\n");
    const tokens = state.tokens;

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];

      if (
        tok.type === "heading_open" &&
        (tok.markup === "=" || tok.markup === "-") &&
        tok.map
      ) {
        const underline = lines[tok.map[1] - 1];
        if (typeof underline === "string") {
          tok.meta = { ...tok.meta, setextUnderline: underline.trim() };
        }
      }

      if (tok.type === "fence" && tok.map) {
        const openLine = lines[tok.map[0]] ?? "";
        const m = openLine.match(/^\s*(`{3,}|~{3,})(.*)$/);
        if (m) {
          tok.meta = { ...tok.meta, fence: m[1], rawInfo: m[2] };
        }
      }

      if (tok.type === "blockquote_open" && tok.map) {
        const firstLine = lines[tok.map[0]] ?? "";
        const bq = firstLine.match(/^\s*>( ?)/);
        tok.meta = {
          ...tok.meta,
          spaceAfterMarker: bq ? bq[1] === " " : true,
        };
      }
    }

    return false;
  });
}
