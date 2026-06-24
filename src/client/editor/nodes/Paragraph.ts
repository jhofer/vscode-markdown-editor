import { setBlockType } from "prosemirror-commands";
import Node from "./Node";
import { getEditorSettings } from "../lib/editorSettings";

export default class Paragraph extends Node {
  get name() {
    return "paragraph";
  }

  get schema() {
    return {
      content: "inline*",
      group: "block",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0],
    };
  }

  keys({ type }) {
    return {
      "Shift-Ctrl-0": setBlockType(type),
    };
  }

  commands({ type }) {
    return () => setBlockType(type);
  }

  toMarkdown(state, node) {
    // Empty paragraphs have no clean CommonMark representation: consecutive
    // blank lines collapse on reload. When the user opts in via the
    // `preserveEmptyParagraphs` setting, write an escaped hard break ("\\\n")
    // so the blank line survives the round trip. Otherwise let it collapse
    // into an ordinary block separator, which keeps the markdown free of
    // stray backslash artifacts.
    const isEmpty =
      node.textContent.trim() === "" && node.childCount === 0 && !state.inTable;

    if (isEmpty && getEditorSettings().preserveEmptyParagraphs) {
      state.write("\\\n");
    } else {
      state.renderInline(node);
      state.closeBlock(node);
    }
  }

  parseMarkdown() {
    return { block: "paragraph" };
  }
}
