import { parser, serializer, schema } from "./server";

const serialize = (doc) => serializer.serialize(doc, undefined);

const table = (...cells) =>
  schema.nodes.table.create(null, [
    schema.nodes.tr.create(null, [
      schema.nodes.th.create(
        null,
        schema.nodes.paragraph.create(null, schema.text("h")),
      ),
    ]),
    schema.nodes.tr.create(null, [schema.nodes.td.create(null, cells)]),
  ]);

test("a <br> in a cell parses into a hard break", () => {
  const doc = parser.parse("| h |\n|---|\n| A<br>B |\n");
  const para = doc.firstChild!.child(1).firstChild!.firstChild!;
  expect(para.childCount).toBe(3);
  expect(para.child(1).type.name).toBe("br");
});

test("a hard break typed in a cell stays inside the row", () => {
  const para = schema.nodes.paragraph.create(null, [
    schema.text("A"),
    schema.nodes.br.create(),
    schema.text("B"),
  ]);
  const doc = schema.nodes.doc.create(null, table(para));
  expect(serialize(doc).split("\n")[2]).toBe("| A<br>B |");
});

test("several paragraphs in a cell are joined with <br>", () => {
  const doc = schema.nodes.doc.create(
    null,
    table(
      schema.nodes.paragraph.create(null, schema.text("A")),
      schema.nodes.paragraph.create(null, schema.text("B")),
    ),
  );
  expect(serialize(doc).split("\n")[2]).toBe("| A<br>B |");
});

test("hard breaks outside tables still use trailing spaces", () => {
  expect(serialize(parser.parse("a  \nb\n"))).toBe("a  \nb");
});

test("a literal \\n in text no longer breaks parsing", () => {
  expect(serialize(parser.parse("say \\n here\n"))).toBe("say \\n here");
});
