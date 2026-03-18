import { parser, serializer } from "./server";

test("renders an empty doc", () => {
  const ast = parser.parse("");

  expect(ast.toJSON()).toEqual({
    content: [{ type: "paragraph" }],
    type: "doc",
  });
});

// --- Fenced code block format (preferred) ---

test("parses plantuml fenced code block", () => {
  const md = `\`\`\`plantuml
@startuml
Alice -> Bob: Hello
@enduml
\`\`\``;
  const ast = parser.parse(md);
  const json = ast.toJSON();
  const plantumlNode = json.content.find((n: any) => n.type === "plantuml");
  expect(plantumlNode).toBeDefined();
  expect(plantumlNode.content[0].text).toBe("Alice -> Bob: Hello");
});

test("parses plantuml fenced code block with text before it", () => {
  const md = `Some text before

\`\`\`plantuml
@startuml
Alice -> Bob: Hello
@enduml
\`\`\``;
  const ast = parser.parse(md);
  const json = ast.toJSON();
  const plantumlNode = json.content.find((n: any) => n.type === "plantuml");
  expect(plantumlNode).toBeDefined();
  expect(plantumlNode.content[0].text).toBe("Alice -> Bob: Hello");
});

test("parses plantuml fenced code block without @startuml/@enduml", () => {
  const md = `\`\`\`plantuml
Alice -> Bob: Hello
\`\`\``;
  const ast = parser.parse(md);
  const json = ast.toJSON();
  const plantumlNode = json.content.find((n: any) => n.type === "plantuml");
  expect(plantumlNode).toBeDefined();
  expect(plantumlNode.content[0].text).toBe("Alice -> Bob: Hello");
});

test("roundtrip plantuml outputs fenced code block format", () => {
  const md = `\`\`\`plantuml
@startuml
Alice -> Bob: Hello
@enduml
\`\`\``;
  const ast = parser.parse(md);
  const output = serializer.serialize(ast, undefined);
  expect(output).toContain("```plantuml");
  expect(output).toContain("@startuml");
  expect(output).toContain("Alice -> Bob: Hello");
  expect(output).toContain("@enduml");
  expect(output).toContain("```");
});

// --- Legacy bare @startuml/@enduml format (backward compat) ---

test("parses legacy plantuml block without leading newline", () => {
  const md = `@startuml
Alice -> Bob: Hello
@enduml`;
  const ast = parser.parse(md);
  const json = ast.toJSON();
  const plantumlNode = json.content.find((n: any) => n.type === "plantuml");
  expect(plantumlNode).toBeDefined();
  expect(plantumlNode.content[0].text).toBe("Alice -> Bob: Hello");
});

test("parses legacy plantuml block with leading newline", () => {
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

test("parses legacy plantuml block with text before it", () => {
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

test("roundtrip legacy plantuml converts to fenced format", () => {
  const md = `@startuml
Alice -> Bob: Hello
@enduml`;
  const ast = parser.parse(md);
  const output = serializer.serialize(ast, undefined);
  expect(output).toContain("```plantuml");
  expect(output).toContain("@startuml");
  expect(output).toContain("Alice -> Bob: Hello");
  expect(output).toContain("@enduml");
});

test("parses legacy plantuml block with backslash before @startuml", () => {
  const md = `\\@startuml
Alice -> Bob: Hello
\\@enduml`;
  const ast = parser.parse(md);
  const json = ast.toJSON();
  const plantumlNode = json.content.find((n: any) => n.type === "plantuml");
  expect(plantumlNode).toBeDefined();
  expect(plantumlNode.content[0].text).toBe("Alice -> Bob: Hello");
});
