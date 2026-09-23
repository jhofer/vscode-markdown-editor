import { InputRule } from "prosemirror-inputrules";
import Node from "./Node";

export default class HorizontalRule extends Node {
  get name() {
    return "hr";
  }

  get schema() {
    return {
      attrs: {
        markup: {
          default: "---",
        },
      },
      group: "block",
      parseDOM: [{ tag: "hr" }],
      toDOM: node => {
        return [
          "hr",
          { class: node.attrs.markup === "***" ? "page-break" : "" },
        ];
      },
    };
  }

  commands({ type }) {
    return attrs => (state, dispatch) => {
      dispatch(
        state.tr.replaceSelectionWith(type.create(attrs)).scrollIntoView()
      );
      return true;
    };
  }

  keys({ type }) {
    return {
      "Mod-_": (state, dispatch) => {
        dispatch(state.tr.replaceSelectionWith(type.create()).scrollIntoView());
        return true;
      },
    };
  }

  inputRules({ type }) {
    return [
      new InputRule(/^(?:---|___\s|\*\*\*\s)$/, (state, match, start, end) => {
        // Only fire where a rule can actually replace the paragraph. In a table
        // cell (content "paragraph+") it can't, and the replace would instead
        // split the table, dropping the cursor into a new row below - so typing
        // `---` in a cell would appear to jump to the next cell.
        const $start = state.doc.resolve(start);
        const parent = $start.node(-1);
        if (
          !parent.canReplaceWith($start.index(-1), $start.indexAfter(-1), type)
        ) {
          return null;
        }

        const { tr } = state;

        if (match[0]) {
          const markup = match[0].trim();
          tr.replaceWith(start - 1, end, type.create({ markup }));
        }

        return tr;
      }),
    ];
  }

  toMarkdown(state, node) {
    state.write(node.attrs.markup);
    state.closeBlock(node);
  }

  parseMarkdown() {
    return {
      node: "hr",
      getAttrs: tok => ({
        markup: tok.markup,
      }),
    };
  }
}
