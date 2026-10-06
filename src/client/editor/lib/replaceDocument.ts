import { Node as ProsemirrorNode } from "prosemirror-model";
import { EditorState, NodeSelection, Transaction } from "prosemirror-state";

/**
 * Builds a transaction that turns the editor's document into `newDoc` by
 * replacing only the range where the two differ, or returns null when they
 * are already the same.
 *
 * Swapping in a whole new EditorState for an update from the host (an echo of
 * our own edit that came back reformatted, or an external change) rebuilds
 * every node view: an open diagram editor or image caption that held focus is
 * torn down, the node selection that keeps a diagram in edit mode is lost,
 * and the caret can only be put back by guessing an offset. Replacing just the
 * changed range leaves everything outside it, including the DOM that has
 * focus, untouched, and the selection is mapped through the change.
 */
export function replaceDocument(
  state: EditorState,
  newDoc: ProsemirrorNode
): Transaction | null {
  const { doc, selection } = state;
  const start = doc.content.findDiffStart(newDoc.content);
  if (start === null || start === undefined) {
    return null;
  }

  const diffEnd = doc.content.findDiffEnd(newDoc.content);
  let endA = diffEnd ? diffEnd.a : doc.content.size;
  let endB = diffEnd ? diffEnd.b : newDoc.content.size;
  // When a run of identical content could be attributed to either end (e.g.
  // "aa" -> "aaa"), the ends can be found before the start; push them back.
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) {
    endA += overlap;
    endB += overlap;
  }

  const tr = state.tr.replace(start, endA, newDoc.slice(start, endB));
  // Not something the user did here, so undo shouldn't revert it.
  tr.setMeta("addToHistory", false);

  // A changed node (a diagram whose fence got a name, say) is replaced as a
  // whole, which would drop a node selection on it and close its editor.
  // Re-select the node that took its place.
  if (selection instanceof NodeSelection) {
    const pos = tr.mapping.map(selection.from, -1);
    const node = tr.doc.nodeAt(pos);
    if (
      node &&
      node.type === selection.node.type &&
      !(tr.selection instanceof NodeSelection && tr.selection.from === pos)
    ) {
      tr.setSelection(NodeSelection.create(tr.doc, pos));
    }
  }

  return tr;
}
