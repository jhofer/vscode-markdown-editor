import { Fragment } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import Node from "./Node";
import detailsRule, { hasOpenAttribute } from "../rules/details";

/**
 * An HTML `<details>` disclosure block with an optional `open` attribute and a
 * `<summary>` label as its first child:
 *
 *     <details open>
 *     <summary>Click me</summary>
 *
 *     Body markdown.
 *
 *     </details>
 *
 * See https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/details
 *
 * Parsing is done by rules/details.ts; this node renders a real `<details>`
 * element in the editor, so collapsing works exactly as it does in a rendered
 * document, and writes the block back out preserving the source's own tag
 * spelling and blank-line layout.
 */
export default class Details extends Node {
  get name() {
    return "details";
  }

  get rulePlugins() {
    return [detailsRule];
  }

  get schema() {
    return {
      attrs: {
        open: { default: true },
        // The opening tag exactly as the source wrote it. Used verbatim while
        // it still agrees with `open`, so attributes we don't model survive a
        // round trip but toggling the block in the editor still writes through.
        markup: { default: "" },
        // Whether the source had a blank line before the body / before
        // `</details>`. Both are the conventional layout (and what markdown
        // inside the block needs to render on GitHub), but a file that omits
        // them shouldn't be rewritten just because it was opened.
        blankBeforeBody: { default: true },
        blankBeforeClose: { default: true },
      },
      content: "summary? block+",
      group: "block",
      defining: true,
      isolating: true,
      parseDOM: [
        {
          tag: "details",
          getAttrs: (dom: HTMLDetailsElement) => ({
            open: dom.hasAttribute("open"),
          }),
        },
      ],
      toDOM: node => {
        const dom = document.createElement("details");
        dom.className = "details-block";
        if (node.attrs.open) dom.setAttribute("open", "");
        dom.addEventListener("toggle", this.handleToggle);
        return { dom, contentDOM: dom };
      },
    };
  }

  /** Mirror the browser's disclosure state back onto the node. */
  handleToggle = (event: Event) => {
    const view = this.editor?.view;
    if (!view) return;

    const dom = event.currentTarget as HTMLDetailsElement;
    const pos = view.posAtDOM(dom, 0) - 1;
    const node = view.state.doc.nodeAt(pos);
    if (!node || node.type.name !== this.name) return;
    if (node.attrs.open === dom.open) return;

    view.dispatch(
      view.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        open: dom.open,
      })
    );
  };

  commands({ type, schema }) {
    return (attrs = {}) => (state, dispatch) => {
      const offset = state.selection.anchor + 1;
      const node = type.create(
        { open: true, ...attrs },
        Fragment.fromArray([
          schema.nodes.summary.create(),
          schema.nodes.paragraph.create(),
        ])
      );

      const tr = state.tr.replaceSelectionWith(node).scrollIntoView();
      tr.setSelection(TextSelection.near(tr.doc.resolve(offset)));
      if (dispatch) dispatch(tr);
      return true;
    };
  }

  toMarkdown(state, node) {
    const { open, markup } = node.attrs;
    const openTag =
      markup && hasOpenAttribute(markup) === open
        ? markup
        : open
        ? "<details open>"
        : "<details>";

    state.write(openTag);
    state.ensureNewLine();

    // `closeBlock` only marks the block as closed; the pending newlines are
    // written by the next `write`, which is how the blank line before the body
    // is opted into (or, via `flushClose(1)`, out of).
    const hasSummary = node.firstChild?.type.name === "summary";
    if (!hasSummary && node.attrs.blankBeforeBody) {
      state.closeBlock(node);
    }

    node.forEach((child, _offset, index) => {
      state.render(child, node, index);
      if (index === 0 && hasSummary && !node.attrs.blankBeforeBody) {
        state.flushClose(1);
      }
    });

    state.flushClose(node.attrs.blankBeforeClose ? 2 : 1);
    state.ensureNewLine();
    state.write("</details>");
    state.closeBlock(node);
  }

  parseMarkdown() {
    return {
      block: "details",
      getAttrs: tok => ({
        open: !!tok.meta?.open,
        markup: tok.meta?.markup || "",
        blankBeforeBody: tok.meta?.blankBeforeBody ?? true,
        blankBeforeClose: tok.meta?.blankBeforeClose ?? true,
      }),
    };
  }
}
