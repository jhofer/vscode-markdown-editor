import { wrappingInputRule } from "prosemirror-inputrules";
import toggleList from "../commands/toggleList";
import Node from "./Node";

export default class BulletList extends Node {
  get name() {
    return "bullet_list";
  }

  get schema() {
    return {
      attrs: {
        // The bullet marker character ("-", "*" or "+"). Preserved from the
        // source markdown so the parse/serialize round trip is faithful and
        // opening a file doesn't spuriously mark it as dirty.
        bullet: { default: "-" },
      },
      content: "list_item+",
      group: "block",
      parseDOM: [{ tag: "ul" }],
      toDOM: () => ["ul", 0],
    };
  }

  commands({ type, schema }) {
    return () => toggleList(type, schema.nodes.list_item);
  }

  keys({ type, schema }) {
    return {
      "Shift-Ctrl-8": toggleList(type, schema.nodes.list_item),
    };
  }

  inputRules({ type }) {
    // Capture the marker the user typed ("-", "*" or "+") so it is preserved
    // on serialization instead of being normalized to a fixed character.
    return [
      wrappingInputRule(/^\s*([-+*])\s$/, type, match => ({ bullet: match[1] })),
    ];
  }

  toMarkdown(state, node) {
    state.renderList(node, "  ", () => (node.attrs.bullet || "-") + " ");
  }

  parseMarkdown() {
    return {
      block: "bullet_list",
      getAttrs: tok => ({ bullet: tok.markup || "-" }),
    };
  }
}
