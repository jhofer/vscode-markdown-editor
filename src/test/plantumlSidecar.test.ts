import {
  Diagram,
  DocumentLayout,
  diagramFolder,
  diagramLink,
  diagramPath,
  extractDiagrams,
  inlineDiagrams,
  isDiagramLink,
  isPrunableSvg,
  nameFences,
  parseSidecar,
  serializeSidecar,
} from "../common/plantumlSidecar";

const layout: DocumentLayout = {
  attachmentsFolder: ".attachments",
  relDir: "docs",
  baseName: "architecture",
};

describe("parseSidecar / serializeSidecar", () => {
  it("parses named blocks", () => {
    const text =
      "@startuml architecture-1\nAlice -> Bob: Hi\n@enduml\n\n@startuml architecture-2\nBob -> Alice: Yo\n@enduml\n";
    const diagrams = parseSidecar(text, "architecture");
    expect(diagrams).toEqual([
      { name: "architecture-1", source: "Alice -> Bob: Hi" },
      { name: "architecture-2", source: "Bob -> Alice: Yo" },
    ]);
  });

  it("assigns names to unnamed blocks, filling gaps", () => {
    const text = "@startuml\nA -> B\n@enduml\n\n@startuml\nC -> D\n@enduml\n";
    const diagrams = parseSidecar(text, "architecture");
    expect(diagrams.map((d) => d.name)).toEqual([
      "architecture-1",
      "architecture-2",
    ]);
  });

  it("round-trips through serializeSidecar", () => {
    const diagrams: Diagram[] = [
      { name: "architecture-1", source: "Alice -> Bob: Hi" },
      { name: "architecture-2", source: "Bob -> Alice: Yo" },
    ];
    const text = serializeSidecar(diagrams);
    expect(parseSidecar(text, "architecture")).toEqual(diagrams);
  });

  it("serializes an empty diagram list as an empty string", () => {
    expect(serializeSidecar([])).toBe("");
  });

  it("parses @startuml(name) (parenthesized, no space) as used by other tooling", () => {
    const text = "@startuml(core-data-model)\nclass Account {\n}\n@enduml\n";
    const diagrams = parseSidecar(text, "Datenmodell");
    expect(diagrams).toEqual([
      { name: "core-data-model", source: "class Account {\n}" },
    ]);
  });

  it("parses a mix of @startuml(name) and @startuml name blocks", () => {
    const text =
      "@startuml(core-data-model)\nA -> B\n@enduml\n\n@startuml architecture-1\nC -> D\n@enduml\n";
    const diagrams = parseSidecar(text, "architecture");
    expect(diagrams.map((d) => d.name)).toEqual([
      "core-data-model",
      "architecture-1",
    ]);
  });

  it("always serializes using the space-separated form, even if the source used parens", () => {
    const text = "@startuml(core-data-model)\nA -> B\n@enduml\n";
    const diagrams = parseSidecar(text, "Datenmodell");
    const serialized = serializeSidecar(diagrams);
    expect(serialized).toBe("@startuml core-data-model\nA -> B\n@enduml\n");
  });
});

describe("path helpers", () => {
  it("builds a nested diagram folder/path/link", () => {
    expect(diagramFolder(layout)).toBe(".attachments/docs/architecture");
    expect(diagramPath(layout, "architecture-1")).toBe(
      ".attachments/docs/architecture/architecture-1.svg",
    );
    expect(diagramLink(layout, "architecture-1")).toBe(
      "/.attachments/docs/architecture/architecture-1.svg",
    );
  });

  it("builds a root-level diagram folder without a relDir segment", () => {
    const rootLayout: DocumentLayout = {
      attachmentsFolder: ".attachments",
      relDir: "",
      baseName: "architecture",
    };
    expect(diagramFolder(rootLayout)).toBe(".attachments/architecture");
  });

  it("supports a custom attachments folder", () => {
    const custom: DocumentLayout = { ...layout, attachmentsFolder: "assets" };
    expect(diagramFolder(custom)).toBe("assets/docs/architecture");
  });
});

describe("isDiagramLink (ownership rule 1)", () => {
  const names = new Set(["architecture-1", "architecture-2"]);

  it("accepts a leading-slash link to a current diagram", () => {
    expect(
      isDiagramLink(
        layout,
        "/.attachments/docs/architecture/architecture-1.svg",
        names,
      ),
    ).toBe(true);
  });

  it("accepts the same link without a leading slash", () => {
    expect(
      isDiagramLink(
        layout,
        ".attachments/docs/architecture/architecture-1.svg",
        names,
      ),
    ).toBe(true);
  });

  it("rejects a stale link to a diagram that no longer exists", () => {
    expect(
      isDiagramLink(
        layout,
        "/.attachments/docs/architecture/architecture-99.svg",
        names,
      ),
    ).toBe(false);
  });

  it("rejects a screenshot living in the same attachments tree", () => {
    expect(
      isDiagramLink(
        layout,
        "/.attachments/docs/architecture/screenshot.png",
        names,
      ),
    ).toBe(false);
  });

  it("rejects an unrelated .attachments/**/foo.png", () => {
    expect(
      isDiagramLink(layout, "/.attachments/other/foo.png", names),
    ).toBe(false);
  });

  it("rejects a nested file inside the diagram folder", () => {
    expect(
      isDiagramLink(
        layout,
        "/.attachments/docs/architecture/sub/architecture-1.svg",
        names,
      ),
    ).toBe(false);
  });

  it("rejects http(s) and data: sources", () => {
    expect(isDiagramLink(layout, "https://example.com/a.svg", names)).toBe(
      false,
    );
    expect(isDiagramLink(layout, "data:image/svg+xml;base64,AAA", names)).toBe(
      false,
    );
  });

  it("rejects a normal image link elsewhere in the document", () => {
    expect(isDiagramLink(layout, "images/foo.png", names)).toBe(false);
  });
});

describe("isPrunableSvg (ownership rule 2)", () => {
  const names = new Set(["architecture-2"]);

  it("prunes a stale diagram svg", () => {
    expect(isPrunableSvg(layout, "architecture-1.svg", names)).toBe(true);
  });

  it("does not prune a current diagram svg", () => {
    expect(isPrunableSvg(layout, "architecture-2.svg", names)).toBe(false);
  });

  it("does not prune a non-diagram file sitting in the same folder", () => {
    expect(isPrunableSvg(layout, "photo.png", names)).toBe(false);
    expect(isPrunableSvg(layout, "architecture-notes.svg", names)).toBe(false);
    expect(isPrunableSvg(layout, "architecture.svg", names)).toBe(false);
  });
});

describe("extractDiagrams / inlineDiagrams round trip", () => {
  it("extracts a single named fence into an image link", () => {
    const md = "before\n\n```plantuml\n@startuml architecture-1\nAlice -> Bob: Hello\n@enduml\n```\n\nafter";
    const { markdown, diagrams } = extractDiagrams(md, layout);
    expect(diagrams).toEqual([
      { name: "architecture-1", source: "Alice -> Bob: Hello" },
    ]);
    expect(markdown).toBe(
      "before\n\n![architecture-1](/.attachments/docs/architecture/architecture-1.svg)\n\nafter",
    );
  });

  it("round-trips fence output exactly (extract then inline)", () => {
    // Exactly what PlantUml.toMarkdown produces for a named diagram.
    const fence =
      "```plantuml\n@startuml architecture-1\nAlice -> Bob: Hello\n@enduml\n```";
    const md = `intro\n\n${fence}\n\noutro`;
    const { markdown, diagrams } = extractDiagrams(md, layout);
    const restored = inlineDiagrams(markdown, diagrams, layout);
    expect(restored).toBe(md);
  });

  it("round-trips multiple diagrams, preserving order and names", () => {
    const fence1 =
      "```plantuml\n@startuml architecture-1\nA -> B\n@enduml\n```";
    const fence2 =
      "```plantuml\n@startuml architecture-2\nC -> D\n@enduml\n```";
    const md = `${fence1}\n\ntext between\n\n${fence2}`;
    const { markdown, diagrams } = extractDiagrams(md, layout);
    expect(diagrams.map((d) => d.name)).toEqual([
      "architecture-1",
      "architecture-2",
    ]);
    expect(inlineDiagrams(markdown, diagrams, layout)).toBe(md);
  });

  it("allocates a name for an unnamed fence and de-duplicates collisions", () => {
    const md =
      "```plantuml\n@startuml architecture-1\nA -> B\n@enduml\n```\n\n```plantuml\n@startuml\nC -> D\n@enduml\n```";
    const { diagrams } = extractDiagrams(md, layout);
    expect(diagrams.map((d) => d.name)).toEqual([
      "architecture-1",
      "architecture-2",
    ]);
  });

  it("extracts a legacy bare @startuml/@enduml block", () => {
    const md = "before\n\n@startuml architecture-1\nA -> B\n@enduml\n\nafter";
    const { markdown, diagrams } = extractDiagrams(md, layout);
    expect(diagrams).toEqual([
      { name: "architecture-1", source: "A -> B" },
    ]);
    expect(markdown).toBe(
      "before\n\n![architecture-1](/.attachments/docs/architecture/architecture-1.svg)\n\nafter",
    );
  });

  it("leaves a screenshot link untouched (ownership rule survives extract/inline)", () => {
    const md =
      "![screenshot](/.attachments/docs/architecture/screenshot.png)\n\n```plantuml\n@startuml architecture-1\nA -> B\n@enduml\n```";
    const { markdown, diagrams } = extractDiagrams(md, layout);
    expect(markdown).toContain(
      "![screenshot](/.attachments/docs/architecture/screenshot.png)",
    );
    const restored = inlineDiagrams(markdown, diagrams, layout);
    expect(restored).toBe(md);
  });

  it("leaves an http(s) image and an unrelated attachments image untouched through inline", () => {
    const diagrams: Diagram[] = [
      { name: "architecture-1", source: "A -> B" },
    ];
    const md =
      "![remote](https://example.com/pic.png)\n\n![other](/.attachments/other/foo.png)\n\n![architecture-1](/.attachments/docs/architecture/architecture-1.svg)";
    const restored = inlineDiagrams(md, diagrams, layout);
    expect(restored).toContain("![remote](https://example.com/pic.png)");
    expect(restored).toContain("![other](/.attachments/other/foo.png)");
    expect(restored).toContain("```plantuml");
  });

  it("leaves a stale diagram link (no longer in the diagram list) untouched", () => {
    const md = "![architecture-9](/.attachments/docs/architecture/architecture-9.svg)";
    const restored = inlineDiagrams(md, [], layout);
    expect(restored).toBe(md);
  });

  it("returns no diagrams for markdown with no plantuml blocks", () => {
    const md = "just some text\n\n![a](b.png)";
    const { markdown, diagrams } = extractDiagrams(md, layout);
    expect(diagrams).toEqual([]);
    expect(markdown).toBe(md);
  });
});

describe("nameFences", () => {
  it("names an unnamed fence in place, keeping fence format", () => {
    const md = "```plantuml\n@startuml\nA -> B\n@enduml\n```";
    const named = nameFences(md, "architecture");
    expect(named).toBe(
      "```plantuml\n@startuml architecture-1\nA -> B\n@enduml\n```",
    );
  });

  it("leaves an already-named fence byte-identical", () => {
    const md = "```plantuml\n@startuml architecture-5\nA -> B\n@enduml\n```";
    expect(nameFences(md, "architecture")).toBe(md);
  });

  it("does not renumber an existing name when adding a second diagram above it", () => {
    const md =
      "```plantuml\n@startuml\nnew one\n@enduml\n```\n\n```plantuml\n@startuml architecture-1\noriginal\n@enduml\n```";
    const named = nameFences(md, "architecture");
    expect(named).toContain("@startuml architecture-1\noriginal");
    expect(named).toContain("@startuml architecture-2\nnew one");
  });

  it("is a no-op for markdown with no plantuml blocks", () => {
    const md = "just text";
    expect(nameFences(md, "architecture")).toBe(md);
  });
});
