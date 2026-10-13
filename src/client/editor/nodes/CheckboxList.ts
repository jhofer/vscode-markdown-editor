import { wrappingInputRule } from "prosemirror-inputrules";
import toggleList from "../commands/toggleList";
import Node from "./Node";

export default class CheckboxList extends Node {
  get name() {
    return "checkbox_list";
  }

  get schema() {
    return {
      attrs: {
        // Set on a list parsed from the tail of a tight markdown list that
        // mixed checkbox and plain items (rules/checkboxes.ts), so it is
        // written directly below the preceding list, without a blank line.
        joined: { default: false },
      },
      group: "block",
      content: "checkbox_item+",
      toDOM: () => ["ul", { class: this.name }, 0],
      parseDOM: [
        {
          tag: `[class="${this.name}"]`,
        },
      ],
    };
  }

  keys({ type, schema }) {
    return {
      "Shift-Ctrl-7": toggleList(type, schema.nodes.checkbox_item),
    };
  }

  commands({ type, schema }) {
    return () => toggleList(type, schema.nodes.checkbox_item);
  }

  inputRules({ type }) {
    return [wrappingInputRule(/^-?\s*(\[ \])\s$/i, type)];
  }

  toMarkdown(state, node) {
    state.renderList(node, "  ", () => "- ");
  }

  parseMarkdown() {
    return {
      block: "checkbox_list",
      getAttrs: tok => ({ joined: tok.attrGet("joined") === "true" }),
    };
  }
}
