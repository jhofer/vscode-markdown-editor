import * as path from "path";
import {
  formatDroppedResource,
  isImagePath,
} from "../common/droppedResources";
import {
  decodeMarkdownPath,
  encodeMarkdownPath,
  toRelativeMarkdownPath,
} from "../host/droppedResources";
import getDataTransferUris, {
  announcesDroppableUris,
} from "../client/editor/lib/getDataTransferUris";

describe("isImagePath", () => {
  it.each([
    "photo.png",
    "PHOTO.PNG",
    "diagram.drawio.svg",
    "/a/b/c.jpeg",
    "shot.webp",
  ])("treats %s as an image", (candidate) => {
    expect(isImagePath(candidate)).toBe(true);
  });

  it.each(["notes.md", "archive.zip", "noextension", "app.tsx"])(
    "treats %s as a plain file",
    (candidate) => {
      expect(isImagePath(candidate)).toBe(false);
    },
  );
});

describe("encodeMarkdownPath", () => {
  it("encodes the characters that would break a link destination", () => {
    expect(encodeMarkdownPath("./my pic (1).png")).toBe(
      "./my%20pic%20%281%29.png",
    );
  });

  it("encodes a literal percent before the escapes it introduces", () => {
    expect(encodeMarkdownPath("./100% done.png")).toBe("./100%25%20done.png");
  });

  it("leaves non-ascii names readable", () => {
    expect(encodeMarkdownPath("./Übersicht.png")).toBe("./Übersicht.png");
  });

  it("round-trips through decodeMarkdownPath", () => {
    const original = "./a b/c (d)#e.png";
    expect(decodeMarkdownPath(encodeMarkdownPath(original))).toBe(original);
  });

  it("leaves a destination that is not valid encoding alone", () => {
    expect(decodeMarkdownPath("./100%_done.png")).toBe("./100%_done.png");
  });
});

describe("toRelativeMarkdownPath", () => {
  const doc = path.join(path.sep, "repo", "docs", "page.md");

  it("prefixes a sibling file with ./", () => {
    expect(
      toRelativeMarkdownPath(doc, path.join(path.sep, "repo", "docs", "a.png")),
    ).toBe("./a.png");
  });

  it("keeps a path below the document relative to it", () => {
    expect(
      toRelativeMarkdownPath(
        doc,
        path.join(path.sep, "repo", "docs", "img", "a.png"),
      ),
    ).toBe("./img/a.png");
  });

  it("walks up for a file outside the document folder", () => {
    expect(
      toRelativeMarkdownPath(
        doc,
        path.join(path.sep, "repo", "assets", "a.png"),
      ),
    ).toBe("../assets/a.png");
  });

  it("encodes the result", () => {
    expect(
      toRelativeMarkdownPath(
        doc,
        path.join(path.sep, "repo", "docs", "my pic.png"),
      ),
    ).toBe("./my%20pic.png");
  });
});

describe("formatDroppedResource", () => {
  it("embeds an image", () => {
    expect(
      formatDroppedResource({
        rawsrc: "./img/a.png",
        src: "https://example/a.png",
        isImage: true,
        label: "a",
      }),
    ).toBe("![a](./img/a.png)");
  });

  it("links anything else", () => {
    expect(
      formatDroppedResource({
        rawsrc: "./notes.md",
        src: "https://example/notes.md",
        isImage: false,
        label: "notes.md",
      }),
    ).toBe("[notes.md](./notes.md)");
  });

  it("escapes brackets in the label", () => {
    expect(
      formatDroppedResource({
        rawsrc: "./a.md",
        src: "",
        isImage: false,
        label: "[draft].md",
      }),
    ).toBe("[\\[draft\\].md](./a.md)");
  });
});

describe("getDataTransferUris", () => {
  const dataTransfer = (data: Record<string, string>) => ({
    types: Object.keys(data),
    getData: (format: string) => data[format] ?? "",
  });

  it("reads a uri list, skipping comments and blank lines", () => {
    expect(
      getDataTransferUris(
        dataTransfer({
          "text/uri-list":
            "# a comment\r\nfile:///repo/a.png\r\n\r\nfile:///repo/b.md\r\n",
        }),
      ),
    ).toEqual(["file:///repo/a.png", "file:///repo/b.md"]);
  });

  it("reads the plain paths VS Code puts on codefiles", () => {
    expect(
      getDataTransferUris(
        dataTransfer({ codefiles: JSON.stringify(["/repo/a.png"]) }),
      ),
    ).toEqual(["/repo/a.png"]);
  });

  it("decodes percent-encoded resourceurls entries", () => {
    expect(
      getDataTransferUris(
        dataTransfer({
          resourceurls: JSON.stringify(["file%3A%2F%2F%2Frepo%2Fa%20b.png"]),
        }),
      ),
    ).toEqual(["file:///repo/a b.png"]);
  });

  it("deduplicates uris announced in several formats", () => {
    expect(
      getDataTransferUris(
        dataTransfer({
          "text/uri-list": "file:///repo/a.png",
          resourceurls: JSON.stringify(["file:///repo/a.png"]),
        }),
      ),
    ).toEqual(["file:///repo/a.png"]);
  });

  it("reads a VS Code explorer drag once, not once per format", () => {
    expect(
      getDataTransferUris(
        dataTransfer({
          "text/uri-list": "file:///repo/a.png",
          codefiles: JSON.stringify(["/repo/a.png"]),
          resourceurls: JSON.stringify(["file:///repo/a.png"]),
        }),
      ),
    ).toEqual(["file:///repo/a.png"]);
  });

  it("falls back to codefiles when the uri list is empty", () => {
    expect(
      getDataTransferUris(
        dataTransfer({
          "text/uri-list": "",
          codefiles: JSON.stringify(["/repo/a.png", "/repo/b.png"]),
        }),
      ),
    ).toEqual(["/repo/a.png", "/repo/b.png"]);
  });

  it("falls back to a file: uri in plain text", () => {
    expect(
      getDataTransferUris(dataTransfer({ "text/plain": "file:///repo/a.png" })),
    ).toEqual(["file:///repo/a.png"]);
  });

  it("ignores dragged text so it still pastes as text", () => {
    expect(
      getDataTransferUris(dataTransfer({ "text/plain": "just some words" })),
    ).toEqual([]);
  });

  it("survives malformed json", () => {
    expect(getDataTransferUris(dataTransfer({ codefiles: "{not json" }))).toEqual(
      [],
    );
  });

  it("returns nothing without a data transfer", () => {
    expect(getDataTransferUris(null)).toEqual([]);
  });
});

describe("announcesDroppableUris", () => {
  it("accepts a drag that announces a uri list", () => {
    expect(
      announcesDroppableUris({
        types: ["text/uri-list", "text/plain"],
        getData: () => "",
      }),
    ).toBe(true);
  });

  it("accepts a drag that announces VS Code's own formats", () => {
    expect(
      announcesDroppableUris({ types: ["resourceurls"], getData: () => "" }),
    ).toBe(true);
  });

  it("ignores a drag of text, which the editor handles itself", () => {
    expect(
      announcesDroppableUris({
        types: ["text/plain", "text/html"],
        getData: () => "",
      }),
    ).toBe(false);
  });

  it("ignores a drag with nothing to go on", () => {
    expect(announcesDroppableUris(null)).toBe(false);
    expect(announcesDroppableUris({ getData: () => "" })).toBe(false);
  });
});
