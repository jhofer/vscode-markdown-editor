import { EditorState, TextSelection } from "prosemirror-state";
import { parser, schema } from "../server";
import Link from "./Link";

const createLink = (options: Record<string, any> = {}) => {
  const link = new Link(options);
  return link;
};

const stateWithSelection = (md: string, from: number, to = from) => {
  const doc = parser.parse(md);
  return EditorState.create({
    doc,
    selection: TextSelection.create(doc, from, to),
  });
};

const runModK = (link: Link, state: EditorState) => {
  const keys = link.keys({ type: schema.marks.link });
  let next = state;
  const handled = keys["Mod-k"](state, (tr) => {
    next = state.apply(tr);
  });
  return { handled, next };
};

describe("Mod-k", () => {
  // "go [here](https://example.com) now": "here" spans 4..8, " now" 8..12
  const md = "go [here](https://example.com) now\n";

  test("with linked text selected opens the editor instead of removing the link", () => {
    const onKeyboardShortcut = jest.fn();
    const link = createLink({ onKeyboardShortcut });
    const { handled, next } = runModK(link, stateWithSelection(md, 5, 7));

    expect(handled).toBe(true);
    expect(onKeyboardShortcut).toHaveBeenCalled();
    // The link is kept and the cursor collapses inside it.
    expect(next.doc.rangeHasMark(4, 8, schema.marks.link)).toBe(true);
    expect(next.selection.empty).toBe(true);
    expect(next.selection.from).toBe(5);
  });

  test("with a selection starting before the link collapses into the link", () => {
    const onKeyboardShortcut = jest.fn();
    const link = createLink({ onKeyboardShortcut });
    const { next } = runModK(link, stateWithSelection(md, 2, 6));

    expect(onKeyboardShortcut).toHaveBeenCalled();
    expect(next.selection.from).toBe(4);
  });

  test("with plain text selected adds a link", () => {
    const onKeyboardShortcut = jest.fn();
    const link = createLink({ onKeyboardShortcut });
    const { handled, next } = runModK(link, stateWithSelection(md, 9, 12));

    expect(handled).toBe(true);
    expect(onKeyboardShortcut).not.toHaveBeenCalled();
    expect(next.doc.rangeHasMark(9, 12, schema.marks.link)).toBe(true);
  });
});

describe("clicking a link", () => {
  const click = (editable: boolean, init: MouseEventInit = {}) => {
    const onClickLink = jest.fn();
    const link = createLink({ onClickLink });
    const [plugin] = link.plugins;
    const anchor = document.createElement("a");
    anchor.setAttribute("href", "./other.md");
    const event = new MouseEvent("click", { cancelable: true, ...init });
    Object.defineProperty(event, "target", { value: anchor });
    const handler = (plugin.props.handleDOMEvents as any).click;
    handler({ editable }, event);
    return { onClickLink, event };
  };

  test("a plain click while editing only places the cursor", () => {
    const { onClickLink, event } = click(true);
    expect(onClickLink).not.toHaveBeenCalled();
    // The webview must not navigate to the href either.
    expect(event.defaultPrevented).toBe(true);
  });

  test("Ctrl+Click follows the link", () => {
    const { onClickLink } = click(true, { ctrlKey: true });
    expect(onClickLink).toHaveBeenCalledWith("./other.md", expect.anything());
  });

  test("a plain click follows the link when read-only", () => {
    const { onClickLink } = click(false);
    expect(onClickLink).toHaveBeenCalledWith("./other.md", expect.anything());
  });
});
