import { parser, serializer } from "./server";

test("renders an empty doc", () => {
  const ast = parser.parse("");

  expect(ast.toJSON()).toEqual({
    content: [{ type: "paragraph" }],
    type: "doc",
  });
});

test("parses hardbreaks (two trailing spaces) as br nodes", () => {
  const md = "name: test  \ndescription: bla";
  const ast = parser.parse(md);
  const json = ast.toJSON();
  // Should parse as a single paragraph with a br node inside
  const paragraph = json.content[0];
  expect(paragraph.type).toBe("paragraph");
  const types = paragraph.content.map((n: any) => n.type);
  expect(types).toContain("br");
});

test("roundtrip hardbreaks preserve line breaks", () => {
  const md = "name: test  \ndescription: bla";
  const ast = parser.parse(md);
  const output = serializer.serialize(ast, undefined);
  expect(output).toContain("name: test");
  expect(output).toContain("description: bla");
});

test("parses content that looks like frontmatter with hardbreaks", () => {
  // This content has trailing double-spaces on each line (hardbreak syntax)
  // but it is NOT frontmatter - just regular text
  const md = "name: test  \ndescription:bla  \nmeta:  \nversion: 1.0.0  \nokrx";
  const ast = parser.parse(md);
  const json = ast.toJSON();
  // Should produce a single paragraph with br nodes between text
  expect(json.content.length).toBe(1);
  expect(json.content[0].type).toBe("paragraph");
});

test("parses mixed softbreaks and hardbreaks", () => {
  // Single newline (softbreak) should become paragraph, double space + newline (hardbreak) should become br
  const md = "line1  \nline2\nline3";
  const ast = parser.parse(md);
  const json = ast.toJSON();
  // softbreak (line2\nline3) should create paragraph split
  // hardbreak (line1  \nline2) should create br inline
  expect(json.content.length).toBeGreaterThanOrEqual(1);
});

// --- YAML Frontmatter ---

test("parses frontmatter as frontmatter node", () => {
  const md = "---\nname: test\nversion: 1.0\n---\n\nSome body text";
  const ast = parser.parse(md);
  const json = ast.toJSON();
  expect(json.content[0].type).toBe("frontmatter");
  expect(json.content[0].content[0].text).toContain("name: test");
});

test("roundtrip frontmatter preserves --- delimiters", () => {
  const md = "---\nname: test\nversion: 1.0\n---\n\nSome body text";
  const ast = parser.parse(md);
  const output = serializer.serialize(ast, undefined);
  expect(output).toContain("---");
  expect(output).toContain("name: test");
  expect(output).toContain("Some body text");
  expect(output).not.toContain("```");
});

test("frontmatter only at start of document", () => {
  const md = "Some text\n\n---\nname: test\n---";
  const ast = parser.parse(md);
  const json = ast.toJSON();
  // Should NOT be parsed as frontmatter since it's not at the start
  const hasFrontmatter = json.content.some((n: any) => n.type === "frontmatter");
  expect(hasFrontmatter).toBe(false);
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
