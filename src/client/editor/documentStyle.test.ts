import { EditorState, TextSelection } from "prosemirror-state";
import { schema, parser, serializer } from "./server";
import sinkListItem from "./commands/sinkListItem";
import toggleList from "./commands/toggleList";

// Put the cursor inside the text of the Nth top-level list item.
function selectInListItem(state: EditorState, itemIndex: number): EditorState {
  const list = state.doc.firstChild!;
  let pos = 1; // inside the list
  list.forEach((item, offset, index) => {
    if (index === itemIndex) {
      // +1 into list_item, +1 into its paragraph
      pos = 1 + offset + 2;
    }
  });
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, pos))
  );
}

function run(md: string, cmd: (s: EditorState, d: (tr: any) => void) => boolean) {
  let state = EditorState.create({ schema, doc: parser.parse(md) });
  state = selectInListItem(state, 1);
  cmd(state, tr => {
    state = state.apply(tr);
  });
  return serializer.serialize(state.doc, undefined);
}

test("nesting an item in a * list keeps the * marker", () => {
  const out = run("* one\n* two\n* three", sinkListItem(schema.nodes.list_item));
  expect(out).toContain("* one");
  expect(out).toContain("  * two");
  expect(out).not.toContain("- two");
});

test("nesting an item in a + list keeps the + marker", () => {
  const out = run("+ one\n+ two\n+ three", sinkListItem(schema.nodes.list_item));
  expect(out).toContain("  + two");
});

test("toggling a paragraph to a bullet list uses the document's bullet", () => {
  // A document whose only list uses "*" — a freshly toggled list should too.
  const md = "* established\n* list\n\nA loose paragraph.";
  let state = EditorState.create({ schema, doc: parser.parse(md) });
  // select the loose paragraph (last top-level node)
  const lastPos = state.doc.content.size - 2;
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, lastPos))
  );
  toggleList(schema.nodes.bullet_list, schema.nodes.list_item)(
    state,
    tr => {
      state = state.apply(tr);
    }
  );
  const out = serializer.serialize(state.doc, undefined);
  expect(out).toContain("* A loose paragraph.");
});
