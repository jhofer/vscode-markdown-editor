import Node from "./Node";
import breakRule from "../rules/breaks";

export default class HardBreak extends Node {
  get name() {
    return "br";
  }

  get markdownToken() {
    return "hardbreak";
  }

  get schema() {
    return {
      inline: true,
      group: "inline",
      selectable: false,
      attrs: {
        // How a break inside a table cell was spelled in the source (`<br>`,
        // `<br/>`, ...), so it round-trips unchanged. Null elsewhere.
        markup: { default: null },
      },
      parseDOM: [{ tag: "br" }],
      toDOM() {
        return ["br"];
      },
    };
  }

  get rulePlugins() {
    return [breakRule];
  }

  commands({ type }) {
    return () => (state, dispatch) => {
      dispatch(state.tr.replaceSelectionWith(type.create()).scrollIntoView());
      return true;
    };
  }

  keys({ type }) {
    return {
      "Shift-Enter": (state, dispatch) => {
        dispatch(state.tr.replaceSelectionWith(type.create()).scrollIntoView());
        return true;
      },
    };
  }

  toMarkdown(state, node) {
    // A table row must stay on a single line: a newline here would end the
    // row and push the rest of the cell out of the table.
    if (state.inTable) {
      state.write(node.attrs.markup || "<br>");
      return;
    }
    state.write("  \n");
  }

  parseMarkdown() {
    return {
      node: "br",
      getAttrs: tok => ({
        markup: /^<br/i.test(tok.markup || "") ? tok.markup : null,
      }),
    };
  }
}
