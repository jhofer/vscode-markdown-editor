import { parser, serializer } from "./server";

test("renders an empty doc", () => {
  const ast = parser.parse("");

  expect(ast.toJSON()).toEqual({
    content: [{ type: "paragraph" }],
    type: "doc",
  });
});

test("parses plantuml block without leading newline", () => {
  const md = `@startuml
Alice -> Bob: Hello
@enduml`;
  const ast = parser.parse(md);
  const json = ast.toJSON();
  const plantumlNode = json.content.find((n: any) => n.type === "plantuml");
  expect(plantumlNode).toBeDefined();
  expect(plantumlNode.content[0].text).toBe("Alice -> Bob: Hello");
});

test("parses plantuml block with leading newline", () => {
  const md = `
@startuml
Alice -> Bob: Hello
@enduml`;
  const ast = parser.parse(md);
  const json = ast.toJSON();
  const plantumlNode = json.content.find((n: any) => n.type === "plantuml");
  expect(plantumlNode).toBeDefined();
  expect(plantumlNode.content[0].text).toBe("Alice -> Bob: Hello");
});

test("parses plantuml block with text before it", () => {
  const md = `Some text before

@startuml
Alice -> Bob: Hello
@enduml`;
  const ast = parser.parse(md);
  const json = ast.toJSON();
  const plantumlNode = json.content.find((n: any) => n.type === "plantuml");
  expect(plantumlNode).toBeDefined();
  expect(plantumlNode.content[0].text).toBe("Alice -> Bob: Hello");
});

test("roundtrip plantuml preserves content", () => {
  const md = `@startuml
Alice -> Bob: Hello
@enduml`;
  const ast = parser.parse(md);
  const output = serializer.serialize(ast, undefined);
  expect(output).toContain("@startuml");
  expect(output).toContain("Alice -> Bob: Hello");
  expect(output).toContain("@enduml");
});

test("parses plantuml block with backslash before @startuml", () => {
  const md = `\\@startuml
Alice -> Bob: Hello
\\@enduml`;
  const ast = parser.parse(md);
  const json = ast.toJSON();
  const plantumlNode = json.content.find((n: any) => n.type === "plantuml");
  expect(plantumlNode).toBeDefined();
  expect(plantumlNode.content[0].text).toBe("Alice -> Bob: Hello");
});

test("parses plantuml block with backslash before @startuml and normal @enduml", () => {
  const md = `\\@startuml
Alice -> Bob: Hello
@enduml`;
  const ast = parser.parse(md);
  const json = ast.toJSON();
  const plantumlNode = json.content.find((n: any) => n.type === "plantuml");
  expect(plantumlNode).toBeDefined();
  expect(plantumlNode.content[0].text).toBe("Alice -> Bob: Hello");
});
