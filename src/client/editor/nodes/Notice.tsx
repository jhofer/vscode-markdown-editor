import { wrappingInputRule } from "prosemirror-inputrules";
import toggleWrap from "../commands/toggleWrap";
import { WarningIcon, InfoIcon, StarredIcon } from "outline-icons";
import * as React from "react";
import { createRoot } from "react-dom/client";
import Node from "./Node";
import noticesRule from "../rules/notices";

export default class Notice extends Node {
  get styleOptions() {
    return Object.entries({
      info: this.options.dictionary.info,
      warning: this.options.dictionary.warning,
      tip: this.options.dictionary.tip,
    });
  }

  get name() {
    return "container_notice";
  }

  get rulePlugins() {
    return [noticesRule];
  }

  get schema() {
    return {
      attrs: {
        style: {
          default: "info",
        },
        // How the source spelled the fences (`::: info`, `::::warning`, …) and
        // where it put the blank lines just inside them, so opening a file
        // doesn't rewrite every notice to the editor's own spelling. Null for
        // notices with no known source (pasted / editor-created).
        markup: { default: null },
        closeMarkup: { default: null },
        blankAfterOpen: { default: false },
        blankBeforeClose: { default: false },
      },
      content: "block+",
      group: "block",
      defining: true,
      draggable: true,
      parseDOM: [
        {
          tag: "div.notice-block",
          preserveWhitespace: "full",
          contentElement: "div:last-child",
          getAttrs: (dom: HTMLDivElement) => ({
            style: dom.className.includes("tip")
              ? "tip"
              : dom.className.includes("warning")
              ? "warning"
              : undefined,
          }),
        },
      ],
      toDOM: node => {
        const select = document.createElement("select");
        select.addEventListener("change", this.handleStyleChange);

        this.styleOptions.forEach(([key, label]) => {
          const option = document.createElement("option");
          option.value = key;
          option.innerText = label;
          option.selected = node.attrs.style === key;
          select.appendChild(option);
        });

        let component;

        if (node.attrs.style === "tip") {
          component = <StarredIcon color="currentColor" />;
        } else if (node.attrs.style === "warning") {
          component = <WarningIcon color="currentColor" />;
        } else {
          component = <InfoIcon color="currentColor" />;
        }

        const icon = document.createElement("div");
        icon.className = "icon";
        createRoot(icon).render(component);

        return [
          "div",
          { class: `notice-block ${node.attrs.style}` },
          icon,
          ["div", { contentEditable: false }, select],
          ["div", { class: "content" }, 0],
        ];
      },
    };
  }

  commands({ type }) {
    return attrs => toggleWrap(type, attrs);
  }

  handleStyleChange = event => {
    const { view } = this.editor;
    const { tr } = view.state;
    const element = event.target;
    const { top, left } = element.getBoundingClientRect();
    const result = view.posAtCoords({ top, left });

    if (result) {
      const transaction = tr.setNodeMarkup(result.inside, undefined, {
        style: element.value,
      });
      view.dispatch(transaction);
    }
  };

  inputRules({ type }) {
    return [wrappingInputRule(/^:::$/, type)];
  }

  toMarkdown(state, node) {
    const { markup, closeMarkup } = node.attrs;

    state.write(markup || ":::" + (node.attrs.style || "info"));
    state.ensureNewLine();

    // `closeBlock` only marks the block as closed; the pending newlines are
    // written by the next `write`, which is how the blank line after the
    // opening fence is opted into.
    if (node.attrs.blankAfterOpen) state.closeBlock(node);

    state.renderContent(node);

    // An unterminated notice (the source ran to the end of the file) keeps no
    // closing fence, so writing one would add markup the file never had.
    if (closeMarkup !== "") {
      state.flushClose(node.attrs.blankBeforeClose ? 2 : 1);
      state.ensureNewLine();
      state.write(closeMarkup || ":::");
    }

    state.closeBlock(node);
  }

  parseMarkdown() {
    return {
      block: "container_notice",
      getAttrs: tok => ({
        style: (tok.info || "").trim() || "info",
        markup: tok.meta?.markup ?? null,
        closeMarkup: tok.meta?.closeMarkup ?? null,
        blankAfterOpen: tok.meta?.blankAfterOpen ?? false,
        blankBeforeClose: tok.meta?.blankBeforeClose ?? false,
      }),
    };
  }
}
