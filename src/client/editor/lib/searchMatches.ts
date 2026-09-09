import { EditorState } from "prosemirror-state";
import { SearchQuery } from "prosemirror-search";

export type MatchInfo = {
  /** Total number of matches for the query in the document. */
  total: number;
  /**
   * 1-based index of the match that is currently selected, or `0` when the
   * selection is not sitting exactly on a match.
   */
  current: number;
};

/**
 * Count the matches of `query` in `state.doc` and work out which one (if any)
 * the current selection is on. Mirrors the loop `prosemirror-search` itself uses
 * to build its match decorations (`buildMatchDeco`), so the count always agrees
 * with what is highlighted.
 */
export function countMatches(state: EditorState, query: SearchQuery): MatchInfo {
  if (!query.valid) {
    return { total: 0, current: 0 };
  }

  const { from: selFrom, to: selTo } = state.selection;
  const end = state.doc.content.size;
  let total = 0;
  let current = 0;

  for (let pos = 0; ; ) {
    const next = query.findNext(state, pos, end);
    if (!next) {
      break;
    }
    total += 1;
    if (current === 0 && next.from === selFrom && next.to === selTo) {
      current = total;
    }
    // Advance past this match; `+1` guards against zero-length matches.
    pos = Math.max(next.to, pos + 1);
  }

  return { total, current };
}
