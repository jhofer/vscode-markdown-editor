import Node from "./Node";

export default class TableRow extends Node {
  get name() {
    return "tr";
  }

  get schema() {
    return {
      attrs: {
        // How many cells the source row was written with. markdown-it pads a
        // short row out to the table's column count; the serializer drops that
        // padding again so opening a file doesn't add cells to it. Null for
        // rows with no known source (pasted / editor-created).
        cells: { default: null },
      },
      content: "(th | td)*",
      tableRole: "row",
      parseDOM: [{ tag: "tr" }],
      toDOM() {
        return ["tr", 0];
      },
    };
  }

  parseMarkdown() {
    return {
      block: "tr",
      getAttrs: tok => ({ cells: tok.meta?.cells ?? null }),
    };
  }
}
