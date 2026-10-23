import { Node as ProsemirrorNode, NodeType } from "prosemirror-model";
import { Transaction } from "prosemirror-state";

function hasNodeBetween(
  doc: ProsemirrorNode,
  from: number,
  to: number,
  type: NodeType
) {
  let found = false;
  doc.nodesBetween(
    Math.max(0, Math.min(from, doc.content.size)),
    Math.max(0, Math.min(to, doc.content.size)),
    (node) => {
      if (found) return false;
      if (node.type === type) found = true;
      return !found;
    }
  );
  return found;
}

/**
 * Whether a transaction changed anything in or around a node of `type`: one
 * the edit is inside, removed or inserted. Lets a plugin that derives
 * something from all such nodes in the document (heading anchors, say) keep
 * mapping its previous result through the edits that can't affect it, rather
 * than walking the whole document on every keystroke.
 */
export function touchesNodeType(tr: Transaction, type: NodeType): boolean {
  return tr.steps.some((step, i) => {
    const before = tr.docs[i];
    const after = i + 1 < tr.docs.length ? tr.docs[i + 1] : tr.doc;
    let touched = false;
    let moved = false;
    step.getMap().forEach((oldStart, oldEnd, newStart, newEnd) => {
      moved = true;
      touched =
        touched ||
        hasNodeBetween(before, oldStart, oldEnd, type) ||
        hasNodeBetween(after, newStart, newEnd, type);
    });
    // A step that moves nothing (a mark or attribute change) still changes
    // what it applies to; only an attribute step says exactly where.
    if (!moved) {
      const pos = (step as unknown as { pos?: number }).pos;
      touched =
        typeof pos !== "number" || before.nodeAt(pos)?.type === type;
    }
    return touched;
  });
}
