/**
 * markdown-it rule to parse Mermaid blocks.
 *
 * Only the fenced form is supported (unlike PlantUML there is no legacy
 * bare-delimiter syntax):
 *
 *     ```mermaid
 *     flowchart TD
 *       A --> B
 *     ```
 *
 * Runs as a core rule after all block parsing and rewrites `fence` tokens
 * whose info string is `mermaid` into `mermaid` block tokens so the
 * ProseMirror parser picks them up as Mermaid nodes instead of CodeFence
 * nodes. The token's `.content` holds the raw diagram source verbatim.
 */
export default function mermaidRule(md): void {
  md.core.ruler.after("block", "mermaid_fence", function(state) {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.type === "fence" && tok.info.trim().toLowerCase() === "mermaid") {
        tok.type = "mermaid";
        tok.tag = "div";
      }
    }
  });
}
