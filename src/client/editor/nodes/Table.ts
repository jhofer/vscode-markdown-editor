import Node from "./Node";
import { Decoration, DecorationSet } from "prosemirror-view";
import {
  addRowAfter as addRowAfterCommand,
  addRowBefore as addRowBeforeCommand,
  addColumnAfter,
  addColumnBefore,
  deleteColumn,
  deleteRow,
  deleteTable,
  fixTables,
  goToNextCell,
  isInTable,
  setCellAttr,
  tableEditing,
  toggleHeaderCell,
  toggleHeaderColumn,
  toggleHeaderRow,
} from "prosemirror-tables";
import { createTable, getCellsInColumn } from "../lib/tableUtils";
import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import tablesRule from "../rules/tables";

export default class Table extends Node {
  get name() {
    return "table";
  }

  get schema() {
    return {
      attrs: {
        // Whether the source wrote cells padded (`| a | b |`) or tight
        // (`|a|b|`). Captured by rules/tables.ts; defaults to padded, which is
        // also what editor-created tables use.
        padded: { default: true },
        // Which outer pipes the source rows were written with ("both",
        // "leading", "trailing" or "none"), and the same for the delimiter row,
        // which may be written differently from the rows around it.
        pipes: { default: "both" },
        delimiterPipes: { default: null },
      },
      content: "tr+",
      tableRole: "table",
      isolating: true,
      group: "block",
      parseDOM: [{ tag: "table" }],
      toDOM() {
        return [
          "div",
          { class: "scrollable-wrapper" },
          [
            "div",
            { class: "scrollable" },
            ["table", { class: "rme-table" }, ["tbody", 0]],
          ],
        ];
      },
    };
  }

  get rulePlugins() {
    return [tablesRule];
  }

  commands({ schema }) {
    return {
      createTable: ({ rowsCount, colsCount }) => (state, dispatch) => {
        const offset = state.tr.selection.anchor + 1;
        const nodes = createTable(schema, rowsCount, colsCount);
        const tr = state.tr.replaceSelectionWith(nodes).scrollIntoView();
        const resolvedPos = tr.doc.resolve(offset);

        tr.setSelection(TextSelection.near(resolvedPos));
        dispatch(tr);
      },
      setColumnAttr: ({ index, alignment }) => (state, dispatch) => {
        const cells = getCellsInColumn(index)(state.selection) || [];
        let transaction = state.tr;
        cells.forEach(({ pos }) => {
          transaction = transaction.setNodeMarkup(pos, null, {
            alignment,
          });
        });
        dispatch(transaction);
      },
      addColumnBefore: () => addColumnBefore,
      addColumnAfter: () => addColumnAfter,
      deleteColumn: () => deleteColumn,
      addRowBefore: () => addRowBeforeCommand,
      addRowAfter: () => addRowAfterCommand,
      deleteRow: () => deleteRow,
      deleteTable: () => deleteTable,
      toggleHeaderColumn: () => toggleHeaderColumn,
      toggleHeaderRow: () => toggleHeaderRow,
      toggleHeaderCell: () => toggleHeaderCell,
      setCellAttr: () => setCellAttr,
      fixTables: () => fixTables,
    };
  }

  keys() {
    return {
      Tab: (state, dispatch, view) => {
        if (goToNextCell(1)(state, dispatch)) {
          return true;
        }

        if (!isInTable(state)) {
          return false;
        }

        // When tabbing from the last cell, insert a row and move to its first cell.
        const inserted = addRowAfterCommand(state, dispatch);
        if (inserted && view) {
          goToNextCell(1)(view.state, view.dispatch);
        }

        // Keep Tab handling within the editor so focus doesn't leave the window.
        return true;
      },
      "Shift-Tab": goToNextCell(-1),
      Enter: (state, dispatch, view) => {
        if (!isInTable(state)) return false;

        // Only add a row on Enter when there is no next cell (last cell).
        if (goToNextCell(1)(state)) {
          return false;
        }

        const inserted = addRowAfterCommand(state, dispatch);
        if (inserted && view) {
          goToNextCell(1)(view.state, view.dispatch);
        }

        return inserted;
      },
    };
  }

  toMarkdown(state, node) {
    state.renderTable(node);
    state.closeBlock(node);
  }

  parseMarkdown() {
    return {
      block: "table",
      getAttrs: tok => ({
        padded: tok.meta?.padded ?? true,
        pipes: tok.meta?.pipes ?? "both",
        delimiterPipes: tok.meta?.delimiterPipes ?? null,
      }),
    };
  }

  get plugins() {
    const shadowKey = new PluginKey<DecorationSet>("tableShadows");

    // Which tables are wider than the editor, measured from the rendered DOM.
    const shadowedTables = (view: EditorView): number[] => {
      const positions: number[] = [];
      const elements = view.dom.getElementsByClassName("rme-table");
      let index = 0;
      view.state.doc.descendants((node, pos) => {
        // Tables don't nest, and no textblock holds one.
        if (node.isTextblock) return false;
        if (node.type.name !== this.name) return;

        const element = elements[index++]?.parentElement;
        if (element && element.scrollWidth > element.clientWidth) {
          positions.push(pos);
        }
        return false;
      });
      return positions;
    };

    return [
      tableEditing(),
      new Plugin({
        key: shadowKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, decorations) =>
            tr.getMeta(shadowKey) ?? decorations.map(tr.mapping, tr.doc),
        },
        // Measuring a table forces a layout of the whole document, so it isn't
        // done while working out each state update (each keystroke and cursor
        // move) but once the DOM has been updated, and only after the document
        // has stopped changing for a moment.
        view: (view) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const measure = () => {
            timer = undefined;
            if (view.isDestroyed) return;
            const positions = shadowedTables(view);
            const current = shadowKey
              .getState(view.state)
              ?.find()
              .map((decoration) => decoration.from - 1);
            if (
              current &&
              current.length === positions.length &&
              current.every((pos, i) => pos === positions[i])
            ) {
              return;
            }
            const { doc } = view.state;
            const decorations = DecorationSet.create(
              doc,
              positions.map((pos) =>
                Decoration.widget(pos + 1, () => {
                  const shadow = document.createElement("div");
                  shadow.className = "scrollable-shadow right";
                  return shadow;
                })
              )
            );
            view.dispatch(view.state.tr.setMeta(shadowKey, decorations));
          };
          const schedule = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(measure, 150);
          };
          schedule();
          // A narrower window can make a table overflow, too.
          window.addEventListener("resize", schedule);
          return {
            update: (view, prevState) => {
              if (view.state.doc !== prevState.doc) schedule();
            },
            destroy: () => {
              if (timer) clearTimeout(timer);
              window.removeEventListener("resize", schedule);
            },
          };
        },
        props: {
          decorations: (state) => shadowKey.getState(state),
        },
      }),
    ];
  }
}
