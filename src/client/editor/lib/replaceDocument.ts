import { Fragment, Node as ProsemirrorNode } from "prosemirror-model";
import {
  EditorState,
  NodeSelection,
  TextSelection,
  Transaction,
} from "prosemirror-state";

/**
 * Builds a transaction that turns the editor's document into `newDoc` by
 * replacing only the ranges where the two differ, or returns null when they
 * are already the same.
 *
 * Swapping in a whole new EditorState for an update from the host (an echo of
 * our own edit that came back reformatted, or an external change) rebuilds
 * every node view: an open diagram editor or image caption that held focus is
 * torn down, the node selection that keeps a diagram in edit mode is lost,
 * and the caret can only be put back by guessing an offset. Replacing just the
 * changed ranges leaves everything outside them, including the DOM that has
 * focus, untouched, and the selection is mapped through the change.
 *
 * The changes are found per top-level block first, so that two edits far
 * apart (a formatter touching the top and the bottom of a long document, say)
 * don't become one replacement of everything in between, which would carry a
 * caret in that stretch away with it. A caret inside a replaced range keeps
 * its offset into it, clamped to the new content, rather than being pushed to
 * the range's end.
 */
export function replaceDocument(
  state: EditorState,
  newDoc: ProsemirrorNode
): Transaction | null {
  const { doc } = state;
  const blockRanges = diffBlocks(doc, newDoc);
  if (blockRanges.length === 0) {
    return null;
  }

  let tr = buildTransaction(state, newDoc, blockRanges);
  // Each range is fitted into the document on its own; should that not add
  // up to `newDoc` exactly (an open slice that had to be closed differently,
  // say), replace the whole changed stretch as one range instead.
  if (!tr || !tr.doc.eq(newDoc)) {
    tr = buildTransaction(state, newDoc, [
      { start: 0, endA: doc.content.size, startB: 0, endB: newDoc.content.size },
    ]);
  }
  return tr;
}

// A range to replace, in positions of the old document (`start`-`endA`) and
// of the new one (`startB`-`endB`).
type Range = { start: number; endA: number; startB: number; endB: number };

// Each replaced range is a step of its own, and each step copies the path
// down to its change. Past this many, everything from the first to the last
// is replaced in one step (which still only rebuilds the node views of what
// changed, as unchanged nodes compare equal), with the selection still mapped
// range by range.
const MAX_STEPS = 64;

function buildTransaction(
  state: EditorState,
  newDoc: ProsemirrorNode,
  blockRanges: Range[]
): Transaction | null {
  const { doc, selection } = state;
  const ranges = blockRanges
    .map((range) => narrowRange(doc, newDoc, range))
    .filter((range): range is Range => range !== null);
  if (ranges.length === 0) {
    return null;
  }

  const steps =
    ranges.length > MAX_STEPS
      ? [
          {
            start: ranges[0].start,
            endA: ranges[ranges.length - 1].endA,
            startB: ranges[0].startB,
            endB: ranges[ranges.length - 1].endB,
          },
        ]
      : ranges;
  let tr = state.tr;
  // Later ranges first, so the positions of the earlier ones stay valid.
  for (let i = steps.length - 1; i >= 0; i--) {
    const { start, endA, startB, endB } = steps[i];
    tr = tr.replace(start, endA, newDoc.slice(startB, endB));
  }
  // Not something the user did here, so undo shouldn't revert it.
  tr.setMeta("addToHistory", false);

  if (selection instanceof NodeSelection) {
    // A changed node (a diagram whose fence got a name, say) is replaced as
    // a whole, which would drop a node selection on it and close its editor.
    // Re-select the node that took its place.
    const pos = tr.mapping.map(selection.from, -1);
    const node = tr.doc.nodeAt(pos);
    if (
      node &&
      node.type === selection.node.type &&
      !(tr.selection instanceof NodeSelection && tr.selection.from === pos)
    ) {
      tr.setSelection(NodeSelection.create(tr.doc, pos));
    }
  } else if (selection instanceof TextSelection) {
    const anchor = mapPosition(selection.anchor, ranges);
    const head = mapPosition(selection.head, ranges);
    tr.setSelection(
      TextSelection.between(tr.doc.resolve(anchor), tr.doc.resolve(head))
    );
  }

  return tr;
}

/**
 * Maps a position of the old document into the new one: positions outside
 * the replaced ranges move with the content around them, positions inside
 * one keep their offset into it, clamped to the end of the new content.
 */
function mapPosition(pos: number, ranges: Range[]) {
  let diff = 0;
  for (const { start, endA, startB, endB } of ranges) {
    if (pos < start) break;
    if (pos <= endA) {
      return start + diff + Math.min(pos - start, endB - startB);
    }
    diff += endB - startB - (endA - start);
  }
  return pos + diff;
}

/**
 * Shrinks a range of changed blocks to the part that actually differs, or
 * returns null when it doesn't differ at all.
 */
function narrowRange(
  doc: ProsemirrorNode,
  newDoc: ProsemirrorNode,
  range: Range
): Range | null {
  const a = doc.content.cut(range.start, range.endA);
  const b = newDoc.content.cut(range.startB, range.endB);
  const start = a.findDiffStart(b);
  if (start === null || start === undefined) {
    return null;
  }

  const diffEnd = a.findDiffEnd(b);
  let endA = diffEnd ? diffEnd.a : a.size;
  let endB = diffEnd ? diffEnd.b : b.size;
  // When a run of identical content could be attributed to either end (e.g.
  // "aa" -> "aaa"), the ends can be found before the start; push them back.
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) {
    endA += overlap;
    endB += overlap;
  }

  return {
    start: range.start + start,
    endA: range.start + endA,
    startB: range.startB + start,
    endB: range.startB + endB,
  };
}

/**
 * Finds the runs of top-level blocks that differ between the two documents,
 * as position ranges, so that blocks shared by both are kept in place.
 */
function diffBlocks(doc: ProsemirrorNode, newDoc: ProsemirrorNode): Range[] {
  const a = children(doc.content);
  const b = children(newDoc.content);
  const hunks: Hunk[] = [];
  patienceDiff(a, b, 0, a.length, 0, b.length, hunks);
  const offsetsA = offsets(doc.content);
  const offsetsB = offsets(newDoc.content);
  return hunks.map((hunk) => ({
    start: offsetsA[hunk.aFrom],
    endA: offsetsA[hunk.aTo],
    startB: offsetsB[hunk.bFrom],
    endB: offsetsB[hunk.bTo],
  }));
}

// A run of differing blocks, as child index ranges into either document.
type Hunk = { aFrom: number; aTo: number; bFrom: number; bTo: number };

type Block = { node: ProsemirrorNode; key?: string };

function children(fragment: Fragment): Block[] {
  const blocks: Block[] = [];
  fragment.forEach((node) => blocks.push({ node }));
  return blocks;
}

// The position each child starts at, plus the end of the last one.
function offsets(fragment: Fragment): number[] {
  const result: number[] = [];
  fragment.forEach((_node, offset) => result.push(offset));
  result.push(fragment.size);
  return result;
}

// Blocks are matched by their content, computed only for the ones that
// aren't ruled out by the cheaper comparison of the ranges' ends.
function keyOf(block: Block) {
  if (block.key === undefined) {
    block.key = JSON.stringify(block.node.toJSON());
  }
  return block.key;
}

/**
 * Patience diff: after trimming the blocks both ranges share at either end,
 * blocks that occur exactly once in each range are anchors; the longest
 * sequence of anchors in the same order on both sides is kept, and the gaps
 * between them are diffed the same way.
 */
function patienceDiff(
  a: Block[],
  b: Block[],
  aFrom: number,
  aTo: number,
  bFrom: number,
  bTo: number,
  hunks: Hunk[]
) {
  while (aFrom < aTo && bFrom < bTo && a[aFrom].node.eq(b[bFrom].node)) {
    aFrom++;
    bFrom++;
  }
  while (aTo > aFrom && bTo > bFrom && a[aTo - 1].node.eq(b[bTo - 1].node)) {
    aTo--;
    bTo--;
  }
  if (aFrom === aTo && bFrom === bTo) {
    return;
  }

  const countA = new Map<string, number>();
  for (let i = aFrom; i < aTo; i++) {
    const key = keyOf(a[i]);
    countA.set(key, (countA.get(key) ?? 0) + 1);
  }
  const indexB = new Map<string, number>();
  const countB = new Map<string, number>();
  for (let j = bFrom; j < bTo; j++) {
    const key = keyOf(b[j]);
    countB.set(key, (countB.get(key) ?? 0) + 1);
    indexB.set(key, j);
  }
  // Anchors in the order they appear in `a`, each with its position in `b`.
  const anchors: [number, number][] = [];
  for (let i = aFrom; i < aTo; i++) {
    const key = keyOf(a[i]);
    if (countA.get(key) === 1 && countB.get(key) === 1) {
      anchors.push([i, indexB.get(key)!]);
    }
  }

  const kept = longestIncreasing(anchors);
  if (kept.length === 0) {
    if (aTo - aFrom === bTo - bFrom) {
      // As many blocks on both sides and none shared: most likely each was
      // changed in place (a formatter rewriting every block, say), so pair
      // them up and let each pair be narrowed to what changed inside it.
      for (let n = 0; n < aTo - aFrom; n++) {
        hunks.push({
          aFrom: aFrom + n,
          aTo: aFrom + n + 1,
          bFrom: bFrom + n,
          bTo: bFrom + n + 1,
        });
      }
    } else {
      hunks.push({ aFrom, aTo, bFrom, bTo });
    }
    return;
  }

  let prevA = aFrom;
  let prevB = bFrom;
  for (const [i, j] of kept) {
    patienceDiff(a, b, prevA, i, prevB, j, hunks);
    prevA = i + 1;
    prevB = j + 1;
  }
  patienceDiff(a, b, prevA, aTo, prevB, bTo, hunks);
}

// The longest subsequence of the anchors (already in `a` order) whose `b`
// positions increase too.
function longestIncreasing(anchors: [number, number][]) {
  // tails[k]: index into `anchors` of the smallest `b` ending a subsequence
  // of length k + 1; prev links each anchor to the one before it.
  const tails: number[] = [];
  const prev: number[] = new Array(anchors.length).fill(-1);
  for (let n = 0; n < anchors.length; n++) {
    const value = anchors[n][1];
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (anchors[tails[mid]][1] < value) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[n] = tails[lo - 1];
    tails[lo] = n;
  }
  const result: [number, number][] = [];
  for (let n = tails.length ? tails[tails.length - 1] : -1; n !== -1; n = prev[n]) {
    result.push(anchors[n]);
  }
  return result.reverse();
}
