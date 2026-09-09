import { Fragment, Slice, NodeType } from "prosemirror-model";
import { EditorState, Transaction } from "prosemirror-state";
import { ReplaceAroundStep } from "prosemirror-transform";

/**
 * `sinkListItem` from prosemirror-schema-list, but the newly created nested
 * list inherits its parent list's attrs (bullet marker, ordered delimiter,
 * numbering style) instead of the schema defaults. Without this, pressing Tab
 * in a `*` list produced a `-` sub-list and dirtied the file — the concrete
 * case of item 15 in .plans/markdown-roundtrip-fidelity.md.
 */
export default function sinkListItem(itemType: NodeType) {
  return (
    state: EditorState,
    dispatch?: (tr: Transaction) => void
  ): boolean => {
    const { $from, $to } = state.selection;
    const range = $from.blockRange(
      $to,
      node => node.childCount > 0 && node.firstChild!.type === itemType
    );
    if (!range) return false;

    const startIndex = range.startIndex;
    if (startIndex === 0) return false;

    const parent = range.parent;
    const nodeBefore = parent.child(startIndex - 1);
    if (nodeBefore.type !== itemType) return false;

    if (dispatch) {
      const nestedBefore =
        nodeBefore.lastChild && nodeBefore.lastChild.type === parent.type;
      const inner = Fragment.from(nestedBefore ? itemType.create() : null);
      const slice = new Slice(
        Fragment.from(
          itemType.create(
            null,
            // inherit the parent list's markup attrs
            Fragment.from(parent.type.create(parent.attrs, inner))
          )
        ),
        nestedBefore ? 3 : 1,
        0
      );
      const before = range.start;
      const after = range.end;
      dispatch(
        state.tr
          .step(
            new ReplaceAroundStep(
              before - (nestedBefore ? 3 : 1),
              after,
              before,
              after,
              slice,
              1,
              true
            )
          )
          .scrollIntoView()
      );
    }
    return true;
  };
}
