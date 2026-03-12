import MarkdownIt from "markdown-it";

export default function mermaidRule(md: MarkdownIt): void {
  md.core.ruler.push("mermaid_diagram", state => {
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i];
      if (token.type === "fence" && token.info.trim() === "mermaid") {
        token.type = "mermaid_diagram";
        token.tag = "div";
        token.attrSet("content", token.content);
      }
    }
  });
}
