import { DOMSerializer } from "prosemirror-model";
import { EditorState, TextSelection } from "prosemirror-state";
import { parser, serializer, renderToHtml, schema } from "./server";
import Details from "./nodes/Details";
import Summary from "./nodes/Summary";
import { hasOpenAttribute } from "./rules/details";

const parse = (md: string) => parser.parse(md);
const roundTrip = (md: string) => serializer.serialize(parse(md), undefined);

describe("parsing", () => {
  test("a details block becomes details + summary nodes", () => {
    const doc = parse(
      "<details open>\n<summary>Label</summary>\n\nBody.\n\n</details>"
    );
    const details = doc.firstChild!;

    expect(details.type.name).toBe("details");
    expect(details.attrs.open).toBe(true);
    expect(details.firstChild!.type.name).toBe("summary");
    expect(details.firstChild!.textContent).toBe("Label");
    expect(details.child(1).type.name).toBe("paragraph");
    expect(details.child(1).textContent).toBe("Body.");
  });

  test("markdown inside the summary and the body is parsed", () => {
    const doc = parse(
      "<details>\n<summary>**bold**</summary>\n\n- item\n\n</details>"
    );
    const details = doc.firstChild!;

    expect(details.attrs.open).toBe(false);
    expect(details.firstChild!.firstChild!.marks[0].type.name).toBe("strong");
    expect(details.child(1).type.name).toBe("bullet_list");
  });

  test("a summary may span several lines", () => {
    const md = "<details>\n<summary>two\nlines</summary>\n\nBody.\n\n</details>";
    const summary = parse(md).firstChild!.firstChild!;

    expect(summary.child(1).type.name).toBe("soft_break");
    expect(roundTrip(md)).toBe(md);
  });

  test("the block nests", () => {
    const doc = parse(
      [
        "<details open>",
        "<summary>Outer</summary>",
        "",
        "<details>",
        "<summary>Inner</summary>",
        "",
        "Body.",
        "",
        "</details>",
        "",
        "</details>",
      ].join("\n")
    );

    const outer = doc.firstChild!;
    expect(outer.attrs.open).toBe(true);
    expect(outer.child(1).type.name).toBe("details");
    expect(outer.child(1).attrs.open).toBe(false);
  });

  test("a closing tag quoted inside a fence doesn't end the block", () => {
    const md = [
      "<details>",
      "<summary>Label</summary>",
      "",
      "```html",
      "</details>",
      "```",
      "",
      "</details>",
    ].join("\n");
    const details = parse(md).firstChild!;

    expect(details.type.name).toBe("details");
    expect(details.child(1).type.name).toBe("code_block");
    expect(roundTrip(md)).toBe(md);
  });

  test("an unclosed summary is treated as body text", () => {
    const md = "<details>\n<summary>Label\n\nBody.\n\n</details>";
    const details = parse(md).firstChild!;

    expect(details.firstChild!.type.name).toBe("paragraph");
    expect(details.firstChild!.textContent).toBe("<summary>Label");
  });

  test.each([
    ["<details>", false],
    ["<details open>", true],
    ['<details open="">', true],
    ['<details open="true">', true],
    ['<details class="x" open>', true],
    ['<details class="open-ish">', false],
  ])("%s reads open as %s", (tag, open) => {
    expect(hasOpenAttribute(tag)).toBe(open);
    expect(parse(`${tag}\n\nBody.\n\n</details>`).firstChild!.attrs.open).toBe(
      open
    );
  });
});

describe("forms that are left as plain text", () => {
  test("an unclosed block", () => {
    expect(parse("<details>\nBody.").firstChild!.type.name).toBe("paragraph");
  });

  test("tags sharing a line with other content", () => {
    const doc = parse("<details><summary>Label</summary>Body.</details>");
    expect(doc.firstChild!.type.name).toBe("paragraph");
  });

  test("a block inside a code fence", () => {
    const md = "```html\n<details>\n<summary>Label</summary>\n</details>\n```";
    expect(parse(md).firstChild!.type.name).toBe("code_block");
    expect(roundTrip(md)).toBe(md);
  });

  test("an indented block", () => {
    const md = "    <details>\n    <summary>Label</summary>\n    </details>";
    expect(parse(md).firstChild!.type.name).toBe("code_block");
  });
});

describe("serializing", () => {
  test("toggling open rewrites the opening tag", () => {
    const doc = parse("<details>\n<summary>Label</summary>\n\nBody.\n\n</details>");
    const details = doc.firstChild!;
    const opened = details.type.create(
      { ...details.attrs, open: true },
      details.content
    );

    expect(serializer.serialize(doc.copy(doc.content.replaceChild(0, opened)), undefined))
      .toBe("<details open>\n<summary>Label</summary>\n\nBody.\n\n</details>");
  });

  test("attributes we don't model survive", () => {
    const md = '<details class="note" open>\n<summary id="s">Label</summary>\n\nBody.\n\n</details>';
    expect(roundTrip(md)).toBe(md);
  });

  test("the source's blank-line layout survives", () => {
    const tight = "<details>\n<summary>Label</summary>\nBody.\n</details>";
    expect(roundTrip(tight)).toBe(tight);

    const summaryOnly = "<details>\n<summary>Label</summary>\n</details>";
    expect(roundTrip(summaryOnly)).toBe(summaryOnly);
  });
});

describe("rendering to html", () => {
  test("emits a real disclosure element", () => {
    const html = renderToHtml(
      "<details open>\n<summary>Label</summary>\n\nBody.\n\n</details>"
    );

    expect(html).toContain('<details open="">');
    expect(html).toContain("<summary>Label</summary>");
    expect(html).toContain("<p>Body.</p>");
    expect(html).toContain("</details>");
  });
});

describe("rendering in the editor", () => {
  const toDom = (md: string) => {
    const doc = parse(md);
    const fragment = DOMSerializer.fromSchema(schema).serializeFragment(
      doc.content
    );
    const wrapper = document.createElement("div");
    wrapper.appendChild(fragment);
    return wrapper;
  };

  test("an open block renders an expanded disclosure widget", () => {
    const dom = toDom(
      "<details open>\n<summary>Label</summary>\n\nBody.\n\n</details>"
    );
    const details = dom.querySelector("details")!;

    expect(details.open).toBe(true);
    expect(details.querySelector("summary")!.textContent).toBe("Label");
  });

  test("a closed block renders collapsed", () => {
    const dom = toDom(
      "<details>\n<summary>Label</summary>\n\nBody.\n\n</details>"
    );
    expect(dom.querySelector("details")!.open).toBe(false);
  });
});

describe("editing", () => {
  test("inserts an open block and puts the cursor in the summary", () => {
    let state = EditorState.create({ schema, doc: parser.parse("") });
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 1))
    );

    const command = new Details().commands({
      type: schema.nodes.details,
      schema,
    })({});

    expect(command(state, tr => (state = state.apply(tr)))).toBe(true);

    const details = state.doc.firstChild!;
    expect(details.type.name).toBe("details");
    expect(details.attrs.open).toBe(true);
    expect(details.firstChild!.type.name).toBe("summary");
    expect(state.selection.$from.parent.type.name).toBe("summary");

    state = state.apply(state.tr.insertText("Label"));
    const md = serializer.serialize(state.doc, undefined);

    expect(md).toBe("<details open>\n<summary>Label</summary>\n\n</details>");
    // An inserted-but-empty block has to survive being written out and read
    // back in, or the editor would churn the file on every keystroke after it.
    expect(roundTrip(md)).toBe(md);
  });

  test("Enter in the summary moves to the body", () => {
    const md = "<details>\n<summary>Label</summary>\n\nBody.\n\n</details>";
    let state = EditorState.create({ schema, doc: parse(md) });
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 2))
    );
    expect(state.selection.$from.parent.type.name).toBe("summary");

    const enter = new Summary().keys({ type: schema.nodes.summary }).Enter;
    expect(enter(state, tr => (state = state.apply(tr)))).toBe(true);
    expect(state.selection.$from.parent.type.name).toBe("paragraph");
    expect(serializer.serialize(state.doc, undefined)).toBe(md);
  });
});
