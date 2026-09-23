import { EditorState, TextSelection } from "prosemirror-state";
import { parser, serializer, schema } from "../server";
import HorizontalRule from "./HorizontalRule";

const [rule] = new HorizontalRule().inputRules({ type: schema.nodes.hr });

// Mimics prosemirror-inputrules: the text typed so far in the textblock plus
// the character being typed, run against the rule at the cursor.
const typeTrigger = (md: string, textInCell: string, typed: string) => {
  const doc = parser.parse(md);
  let cursor = -1;
  doc.descendants((node, pos) => {
    if (cursor === -1 && node.isText && node.text === textInCell) {
      cursor = pos + node.nodeSize;
    }
  });
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, cursor),
  });
  const $cursor = state.doc.resolve(cursor);
  const textBefore = $cursor.parent.textBetween(0, $cursor.parentOffset) + typed;
  const match = (rule as any).match.exec(textBefore);
  const start = cursor - (match[0].length - typed.length);
  return (rule as any).handler(state, match, start, cursor);
};

test("--- at the start of a paragraph becomes a horizontal rule", () => {
  const tr = typeTrigger("--\n", "--", "-");
  expect(tr).toBeTruthy();
  expect(tr.doc.firstChild.type.name).toBe("hr");
});

test("--- typed in a table cell stays text instead of splitting the table", () => {
  const md = "| a | b |\n| - | - |\n| -- | x |\n";
  expect(typeTrigger(md, "--", "-")).toBeNull();
  // The cell still round-trips untouched.
  expect(serializer.serialize(parser.parse(md), undefined)).toBe(md);
});
