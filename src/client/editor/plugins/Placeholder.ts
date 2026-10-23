import { Plugin } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import Extension from "../lib/Extension";

export default class Placeholder extends Extension {
  get name() {
    return "empty-placeholder";
  }

  get defaultOptions() {
    return {
      emptyNodeClass: "placeholder",
      placeholder: "",
    };
  }

  get plugins() {
    return [
      new Plugin({
        props: {
          decorations: (state): any => {
            const { doc } = state;
            // Checked cheapest first: this runs on every state update, and
            // `textContent` builds the whole document's text.
            const completelyEmpty =
              doc.childCount <= 1 &&
              doc.content.size <= 2 &&
              doc.textContent === "";
            const node = doc.firstChild;
            if (!completelyEmpty || !node || node.type.name !== "paragraph") {
              return DecorationSet.empty;
            }

            return DecorationSet.create(doc, [
              Decoration.node(0, node.nodeSize, {
                class: this.options.emptyNodeClass,
                "data-empty-text": this.options.placeholder,
              }),
            ]);
          },
        },
      }),
    ];
  }
}
