import CodeFence from "./CodeFence";
import Prism from "../plugins/Prism";
import frontmatterRule from "../rules/frontmatter";

export default class Frontmatter extends CodeFence {
  get name() {
    return "frontmatter";
  }

  get schema() {
    return {
      ...super.schema,
      attrs: {
        language: {
          default: "yaml",
        },
      },
    };
  }

  get rulePlugins() {
    return [frontmatterRule];
  }

  get plugins() {
    return [Prism({ name: this.name })];
  }

  inputRules() {
    return [];
  }

  get markdownToken() {
    return "frontmatter";
  }

  toMarkdown(state, node) {
    state.write("---\n");
    state.text(node.textContent, false);
    state.ensureNewLine();
    state.write("---");
    state.closeBlock(node);
  }

  parseMarkdown() {
    return {
      block: "frontmatter",
      noCloseToken: true,
      getAttrs: () => ({ language: "yaml" }),
    };
  }
}
