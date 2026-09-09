import { NodeType } from "prosemirror-model";
import { EditorState, Transaction } from "prosemirror-state";
import { wrapInList, liftListItem } from "prosemirror-schema-list";
import { findParentNode } from "prosemirror-utils";
import isList from "../queries/isList";
import { getDocumentStyle } from "../lib/documentStyle";

// Attrs a list node created while editing should take, so it matches the
// document's prevailing style instead of the schema's hard-coded default (which
// would turn a `*`-bulleted document's new sub-lists into `-`).
function styleAttrs(listType: NodeType): Record<string, unknown> {
  const style = getDocumentStyle();
  if (listType.name === "ordered_list") {
    return {
      delimiter: style.orderedDelimiter,
      counter: style.orderedCounter,
    };
  }
  if (listType.name === "bullet_list") {
    return { bullet: style.bullet };
  }
  return {};
}

export default function toggleList(listType: NodeType, itemType: NodeType) {
  return (state: EditorState, dispatch: (tr: Transaction) => void) => {
    const { schema, selection } = state;
    const { $from, $to } = selection;
    const range = $from.blockRange($to);

    if (!range) {
      return false;
    }

    const parentList = findParentNode(node => isList(node, schema))(selection);

    if (range.depth >= 1 && parentList && range.depth - parentList.depth <= 1) {
      if (parentList.node.type === listType) {
        return liftListItem(itemType)(state, dispatch);
      }

      if (
        isList(parentList.node, schema) &&
        listType.validContent(parentList.node.content)
      ) {
        const { tr } = state;
        // A converted list is a new node: give it the document's prevailing
        // style rather than the schema default.
        tr.setNodeMarkup(parentList.pos, listType, styleAttrs(listType));

        if (dispatch) {
          dispatch(tr);
        }

        return false;
      }
    }

    return wrapInList(listType, styleAttrs(listType))(state, dispatch);
  };
}
