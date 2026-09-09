import { EditorState, TextSelection } from "prosemirror-state";
import { SearchQuery } from "prosemirror-search";
import { parser, schema } from "../server";
import { countMatches } from "./searchMatches";

function stateFor(markdown: string): EditorState {
  return EditorState.create({ schema, doc: parser.parse(markdown) });
}

/** Move the selection onto the nth (1-based) match of `query`. */
function selectMatch(state: EditorState, query: SearchQuery, n: number) {
  let pos = 0;
  let match = query.findNext(state, pos);
  for (let i = 1; match && i < n; i++) {
    pos = Math.max(match.to, pos + 1);
    match = query.findNext(state, pos);
  }
  if (!match) {
    throw new Error(`no match #${n}`);
  }
  return state.apply(
    state.tr.setSelection(
      TextSelection.create(state.doc, match.from, match.to)
    )
  );
}

test("counts every occurrence across paragraphs", () => {
  const state = stateFor("one fish two fish\n\nred fish blue fish");
  const query = new SearchQuery({ search: "fish" });

  expect(countMatches(state, query)).toEqual({ total: 4, current: 0 });
});

test("reports the 1-based index of the selected match", () => {
  const base = stateFor("alpha beta alpha beta alpha");
  const query = new SearchQuery({ search: "alpha" });

  expect(countMatches(selectMatch(base, query, 1), query)).toEqual({
    total: 3,
    current: 1,
  });
  expect(countMatches(selectMatch(base, query, 3), query)).toEqual({
    total: 3,
    current: 3,
  });
});

test("is case-insensitive by default and case-sensitive on request", () => {
  const state = stateFor("Foo foo FOO");

  expect(countMatches(state, new SearchQuery({ search: "foo" })).total).toBe(3);
  expect(
    countMatches(state, new SearchQuery({ search: "foo", caseSensitive: true }))
      .total
  ).toBe(1);
});

test("returns no matches for an empty or absent query", () => {
  const state = stateFor("nothing to find here");

  expect(countMatches(state, new SearchQuery({ search: "" }))).toEqual({
    total: 0,
    current: 0,
  });
  expect(countMatches(state, new SearchQuery({ search: "zzz" }))).toEqual({
    total: 0,
    current: 0,
  });
});
