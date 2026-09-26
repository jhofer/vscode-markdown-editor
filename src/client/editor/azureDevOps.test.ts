import { EditorState, TextSelection } from "prosemirror-state";
import { parser } from "./server";
import AzureDevOps, { collectReferences } from "./plugins/AzureDevOps";
import { AzureDevOpsStore } from "./lib/azureDevOpsStore";

const GUID = "6f1d3e0a-1b2c-4d5e-8f90-a1b2c3d4e5f6";

describe("collectReferences", () => {
  test("skips code and links", () => {
    const doc = parser.parse(
      `#1 and @<${GUID}>\n\n\`#2\` [#3](https://example.com)\n\n\`\`\`\n#4\n\`\`\`\n`
    );
    expect(collectReferences(doc).map((r) => r.id)).toEqual([1, GUID]);
  });
});

describe("AzureDevOpsStore", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("batches lookups and asks for each id once", () => {
    const request = jest.fn();
    const store = new AzureDevOpsStore(request);
    store.ensure([1, 12], []);
    store.ensure([123, 1], [GUID]);
    expect(request).not.toHaveBeenCalled();
    jest.runAllTimers();
    expect(request).toHaveBeenCalledWith([1, 12, 123], [GUID]);

    store.ensure([1, 123], [GUID]);
    jest.runAllTimers();
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("AzureDevOps decorations", () => {
  const workItem = {
    id: 1,
    title: "Crash on save",
    type: "Bug",
    state: "Active",
    url: "https://dev.azure.com/contoso/P/_workitems/edit/1",
  };

  const setup = (markdown: string) => {
    const store = new AzureDevOpsStore(() => undefined);
    const [plugin] = new AzureDevOps({ store }).plugins;
    const doc = parser.parse(markdown);
    const state = EditorState.create({ doc, plugins: [plugin] });
    const decorations = (s: EditorState) =>
      (plugin.props.decorations as any).call(plugin, s).find();
    return { store, state, decorations };
  };

  test("marks unresolved references, then renders resolved ones as widgets", () => {
    const { store, state, decorations } = setup(`see #1 and #2\n`);
    expect(decorations(state).map((d: any) => d.type.attrs?.class)).toEqual([
      "ado-reference",
      "ado-reference",
    ]);

    store.merge({ workItems: { 1: workItem, 2: null }, users: {} });
    // Cursor at the document end, away from both references.
    const moved = state.apply(
      state.tr.setSelection(TextSelection.atEnd(state.doc))
    );
    const found = decorations(moved);
    expect(found).toHaveLength(2);
    const widget = found.find((d: any) => d.type.toDOM);
    const dom = widget.type.toDOM() as HTMLElement;
    expect(dom.tagName).toBe("A");
    expect(dom.getAttribute("href")).toBe(workItem.url);
    expect(dom.textContent).toBe("#1 Crash on save Active");
  });

  test("shows the source while the cursor is on a reference", () => {
    const { store, state, decorations } = setup(`see #1\n`);
    store.merge({ workItems: { 1: workItem }, users: {} });
    const onReference = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 6))
    );
    expect(decorations(onReference).map((d: any) => d.type.attrs?.class)).toEqual([
      "ado-reference",
    ]);
  });

  test("renders a user mention as its display name", () => {
    const { store, state, decorations } = setup(`hi @<${GUID}> there\n`);
    store.merge({
      workItems: {},
      users: { [GUID]: { id: GUID, displayName: "Ada Lovelace" } },
    });
    const moved = state.apply(
      state.tr.setSelection(TextSelection.atEnd(state.doc))
    );
    const widget = decorations(moved).find((d: any) => d.type.toDOM);
    expect((widget.type.toDOM() as HTMLElement).textContent).toBe(
      "@Ada Lovelace"
    );
  });
});
