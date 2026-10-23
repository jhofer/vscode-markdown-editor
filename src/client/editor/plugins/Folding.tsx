import { Node } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import Extension from "../lib/Extension";
import { findBlockNodes } from "prosemirror-utils";
import findCollapsedNodes from "../queries/findCollapsedNodes";
import { headingToPersistenceKey } from "../lib/headingToSlug";
import { touchesNodeType } from "../lib/touchesNodeType";

type FoldingState = {
  decorations: DecorationSet;
  // Whether any heading is collapsed; while none is, an edit that leaves the
  // headings alone can't fold anything.
  anyCollapsed: boolean;
};

const pluginKey = new PluginKey<FoldingState>("folding");

function foldingState(doc: Node): FoldingState {
  const decorations: Decoration[] = findCollapsedNodes(doc).map(block =>
    Decoration.node(block.pos, block.pos + block.node.nodeSize, {
      class: "folded-content",
    })
  );
  let anyCollapsed = false;
  doc.descendants(node => {
    if (anyCollapsed) return false;
    if (node.type.name === "heading" && node.attrs.collapsed) {
      anyCollapsed = true;
    }
    return !node.isTextblock;
  });
  return {
    decorations: DecorationSet.create(doc, decorations),
    anyCollapsed,
  };
}

export default class Folding extends Extension {
  get name() {
    return "folding";
  }

  get plugins() {
    let loaded = false;

    return [
      new Plugin({
        key: pluginKey,
        // Worked out once per document change rather than for every state
        // update (each cursor move): finding collapsed sections walks it all.
        state: {
          init: (_, state) => foldingState(state.doc),
          apply: (tr, value) => {
            if (!tr.docChanged) return value;
            if (
              !value.anyCollapsed &&
              !touchesNodeType(tr, tr.doc.type.schema.nodes.heading)
            ) {
              return value;
            }
            return foldingState(tr.doc);
          },
        },
        view: view => {
          loaded = false;
          view.dispatch(view.state.tr.setMeta("folding", { loaded: true }));
          return {};
        },
        appendTransaction: (transactions, oldState, newState) => {
          if (loaded) return;
          if (
            !transactions.some(transaction => transaction.getMeta("folding"))
          ) {
            return;
          }

          let modified = false;
          const tr = newState.tr;
          const blocks = findBlockNodes(newState.doc);

          for (const block of blocks) {
            if (block.node.type.name === "heading") {
              const persistKey = headingToPersistenceKey(
                block.node,
                this.editor.props.id
              );
              const persistedState = localStorage?.getItem(persistKey);

              if (persistedState === "collapsed") {
                tr.setNodeMarkup(block.pos, undefined, {
                  ...block.node.attrs,
                  collapsed: true,
                });
                modified = true;
              }
            }
          }

          loaded = true;
          return modified ? tr : null;
        },
        props: {
          decorations: (state): any =>
            pluginKey.getState(state)?.decorations,
        },
      }),
    ];
  }
}
