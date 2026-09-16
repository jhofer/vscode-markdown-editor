import { TextSelection } from "prosemirror-state";
import Node from "./Node";

/**
 * The `<summary>` child of a `<details>` disclosure block — the always-visible
 * label. Only valid as the first child of `details` (it deliberately isn't in
 * the `block` group, so the schema can't put it anywhere else).
 */
export default class Summary extends Node {
  get name() {
    return "summary";
  }

  get schema() {
    return {
      attrs: {
        // The opening tag exactly as the source wrote it, so attributes we
        // don't model (`class`, …) survive a round trip.
        markup: { default: "<summary>" },
      },
      content: "inline*",
      defining: true,
      selectable: false,
      parseDOM: [{ tag: "summary" }],
      toDOM: () => {
        const dom = document.createElement("summary");
        dom.className = "details-summary";
        dom.addEventListener("click", this.handleClick);
        return { dom, contentDOM: dom };
      },
    };
  }

  /**
   * Clicking a `<summary>` natively toggles its parent — which makes the label
   * impossible to edit, since every click to place the cursor also collapses
   * the block. Keep the toggle for clicks on the disclosure marker (the
   * summary's leading padding) and suppress it everywhere else.
   */
  handleClick = (event: MouseEvent) => {
    if (this.editor?.props.readOnly) return;

    const dom = event.currentTarget as HTMLElement;
    const styles = window.getComputedStyle(dom);
    const rect = dom.getBoundingClientRect();
    const marker =
      styles.direction === "rtl"
        ? rect.right - event.clientX <= parseFloat(styles.paddingRight)
        : event.clientX - rect.left <= parseFloat(styles.paddingLeft);

    if (!marker) {
      event.preventDefault();
    }
  };

  keys({ type }) {
    return {
      // Enter inside the summary can't split it (a second summary wouldn't be
      // valid), so move on to the body instead.
      Enter: (state, dispatch) => {
        const { $from } = state.selection;
        if ($from.parent.type !== type) return false;

        const tr = state.tr;
        const selection = TextSelection.near(tr.doc.resolve($from.after()), 1);
        if (dispatch) dispatch(tr.setSelection(selection).scrollIntoView());
        return true;
      },
    };
  }

  toMarkdown(state, node) {
    state.write(node.attrs.markup || "<summary>");
    state.renderInline(node);
    state.write("</summary>");
    state.closeBlock(node);
  }

  parseMarkdown() {
    return {
      block: "summary",
      getAttrs: tok => ({ markup: tok.meta?.markup || "<summary>" }),
    };
  }
}
