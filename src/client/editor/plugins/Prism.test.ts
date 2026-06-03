import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { refractor } from "refractor/core";
import javascript from "refractor/javascript";
import Prism from "./Prism";

refractor.register(javascript);

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    text: { group: "inline" },
    code_fence: {
      attrs: {
        language: { default: "javascript" },
      },
      content: "text*",
      marks: "",
      group: "block",
      code: true,
    },
  },
});

test("highlights code fences when state is initialized with existing document", () => {
  const prismPlugin = Prism({ name: "code_fence" });

  // Simulate the plugin having already highlighted once (e.g. first empty render)
  const emptyDoc = schema.node("doc", null, [schema.node("code_fence")]);
  const emptyState = EditorState.create({
    schema,
    doc: emptyDoc,
    plugins: [prismPlugin],
  });
  emptyState.apply(emptyState.tr.setMeta("prism", { loaded: true }));

  // Simulate external value update that replaces editor state with document content
  const docWithCode = schema.node("doc", null, [
    schema.node(
      "code_fence",
      { language: "javascript" },
      schema.text("const hello = 1;")
    ),
  ]);

  const replacedState = EditorState.create({
    schema,
    doc: docWithCode,
    plugins: [prismPlugin],
  });

  const decorationSet = prismPlugin.getState(replacedState);
  expect(decorationSet.find().length).toBeGreaterThan(0);
});
