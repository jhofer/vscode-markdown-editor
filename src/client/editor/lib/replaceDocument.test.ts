import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { parser, serializer } from "../server";
import { replaceDocument } from "./replaceDocument";

const posOfText = (state: EditorState, text: string) => {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found === -1 && node.isText && node.text?.includes(text)) {
      found = pos + node.text.indexOf(text);
    }
  });
  return found;
};

const stateWithCaret = (md: string, beforeText: string) => {
  const doc = parser.parse(md);
  const state = EditorState.create({ doc });
  const pos = posOfText(state, beforeText);
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, pos))
  );
};

test("returns null when nothing changed", () => {
  const state = EditorState.create({ doc: parser.parse("# Title\n\nText\n") });
  expect(replaceDocument(state, parser.parse("# Title\n\nText\n"))).toBeNull();
});

test("loads the new content", () => {
  const state = EditorState.create({ doc: parser.parse("one\n\ntwo\n") });
  const tr = replaceDocument(state, parser.parse("one\n\nthree\n"));
  expect(serializer.serialize(tr!.doc, undefined)).toBe(
    serializer.serialize(parser.parse("one\n\nthree\n"), undefined)
  );
});

test("keeps the caret on its text when content above it changes", () => {
  const state = stateWithCaret("intro\n\nsecond line\n", "line");
  const tr = replaceDocument(
    state,
    parser.parse("a much longer intro\n\nsecond line\n")
  )!;
  const next = state.apply(tr);
  expect(next.selection.head).toBe(posOfText(next, "line"));
});

test("keeps a diagram being edited selected when the host names it", () => {
  const md = "text\n\n```plantuml\n@startuml\nA -> B\n@enduml\n```\n";
  const doc = parser.parse(md);
  let diagramPos = -1;
  doc.forEach((node, offset) => {
    if (node.type.name === "plantuml") diagramPos = offset;
  });
  expect(diagramPos).toBeGreaterThan(-1);
  const state = EditorState.create({
    doc,
    selection: NodeSelection.create(doc, diagramPos),
  });

  // The host gives a new diagram a name on its first round trip.
  const changed = parser.parse(md.replace("@startuml\n", "@startuml doc-1\n"));
  const next = state.apply(replaceDocument(state, changed)!);

  expect(next.selection).toBeInstanceOf(NodeSelection);
  expect((next.selection as NodeSelection).node.attrs.name).toBe("doc-1");
});

test("leaves nodes outside the changed range untouched", () => {
  const state = EditorState.create({
    doc: parser.parse("first\n\nsecond\n\nthird\n"),
  });
  const next = state.apply(
    replaceDocument(state, parser.parse("first\n\nchanged\n\nthird\n"))!
  );
  expect(next.doc.child(0)).toBe(state.doc.child(0));
  expect(next.doc.child(2)).toBe(state.doc.child(2));
});

test("is left out of the undo history", () => {
  const state = EditorState.create({ doc: parser.parse("a\n") });
  const tr = replaceDocument(state, parser.parse("b\n"))!;
  expect(tr.getMeta("addToHistory")).toBe(false);
});
