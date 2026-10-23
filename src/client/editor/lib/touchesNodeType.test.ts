import { EditorState } from "prosemirror-state";
import { parser, schema, serializer } from "../server";
import { touchesNodeType } from "./touchesNodeType";

const md = "# Title\n\nFirst paragraph.\n\n- item\n\n## Second\n\nLast paragraph.\n";
const heading = schema.nodes.heading;

const posOfText = (state: EditorState, text: string) => {
  let found = -1;
  state.doc.descendants((node, pos) => {
    if (found === -1 && node.isText && node.text?.includes(text)) {
      found = pos + node.text.indexOf(text);
    }
  });
  return found;
};

const state = () => EditorState.create({ doc: parser.parse(md) });

test("typing in a paragraph or list doesn't touch a heading", () => {
  const s = state();
  expect(
    touchesNodeType(s.tr.insertText("x", posOfText(s, "First")), heading)
  ).toBe(false);
  expect(
    touchesNodeType(s.tr.insertText("x", posOfText(s, "item")), heading)
  ).toBe(false);
});

test("typing in a heading touches it", () => {
  const s = state();
  expect(
    touchesNodeType(s.tr.insertText("x", posOfText(s, "Second")), heading)
  ).toBe(true);
});

test("removing a heading touches it", () => {
  const s = state();
  const from = posOfText(s, "Second") - 1;
  const node = s.doc.nodeAt(from)!;
  expect(node.type).toBe(heading);
  expect(
    touchesNodeType(s.tr.delete(from, from + node.nodeSize), heading)
  ).toBe(true);
});

test("inserting a heading touches it", () => {
  const s = state();
  const pos = posOfText(s, "Last") - 1;
  const tr = s.tr.insert(pos, heading.create({ level: 2 }, schema.text("New")));
  expect(touchesNodeType(tr, heading)).toBe(true);
});

test("changing a heading's attributes touches it", () => {
  const s = state();
  const pos = posOfText(s, "Second") - 1;
  const node = s.doc.nodeAt(pos)!;
  expect(
    touchesNodeType(
      s.tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: true }),
      heading
    )
  ).toBe(true);
  expect(
    touchesNodeType(s.tr.setNodeAttribute(pos, "collapsed", true), heading)
  ).toBe(true);
});

test("a mark change counts as touching", () => {
  const s = state();
  const from = posOfText(s, "First");
  expect(
    touchesNodeType(
      s.tr.addMark(from, from + 5, schema.marks.strong.create()),
      heading
    )
  ).toBe(true);
});

test("a transaction with several steps is checked step by step", () => {
  const s = state();
  const tr = s.tr.insertText("x", posOfText(s, "First"));
  tr.insertText("y", tr.mapping.map(posOfText(s, "Second")));
  expect(touchesNodeType(tr, heading)).toBe(true);
  expect(serializer.serialize(tr.doc, undefined)).toContain("## ySecond");
});
