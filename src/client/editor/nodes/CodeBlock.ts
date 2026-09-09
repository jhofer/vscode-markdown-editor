import CodeFence from "./CodeFence";

export default class CodeBlock extends CodeFence {
  get name() {
    return "code_block";
  }

  get markdownToken() {
    return "code_block";
  }

  // The parser routes both markdown-it `fence` and `code_block` tokens to the
  // ProseMirror `code_block` node type, so this one serializer sees both. A
  // fenced block keeps CodeFence's ``` / ~~~ output; only a genuinely indented
  // block (fenced === false) is re-emitted with a 4-space prefix instead of
  // being rewritten to a fence on open.
  toMarkdown(state, node) {
    if (node.attrs.fenced === false) {
      state.wrapBlock("    ", null, node, () => {
        state.text(node.textContent, false);
      });
      return;
    }
    super.toMarkdown(state, node);
  }

  parseMarkdown() {
    return {
      block: "code_block",
      getAttrs: () => ({ language: "", fenced: false }),
    };
  }
}
