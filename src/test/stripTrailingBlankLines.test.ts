import { stripTrailingBlankLines } from "../common/stripTrailingBlankLines";

describe("stripTrailingBlankLines", () => {
  it("removes trailing backslash-only lines and ensures one final newline", () => {
    expect(stripTrailingBlankLines("a\n\\\n\\\n")).toBe("a\n");
  });

  it("collapses multiple trailing blank lines to a single final newline", () => {
    expect(stripTrailingBlankLines("a\n\n\n")).toBe("a\n");
  });

  it("adds a trailing newline when missing", () => {
    expect(stripTrailingBlankLines("a")).toBe("a\n");
  });

  it("returns empty string for empty input", () => {
    expect(stripTrailingBlankLines("")).toBe("");
  });

  it("returns empty string for whitespace/backslash-only input", () => {
    expect(stripTrailingBlankLines("\n\\\n  \n")).toBe("");
  });

  it("preserves interior backslash-only lines", () => {
    expect(stripTrailingBlankLines("a\n\\\nb\n\\\n")).toBe("a\n\\\nb\n");
  });

  it("preserves interior blank lines", () => {
    expect(stripTrailingBlankLines("a\n\nb\n\n\n")).toBe("a\n\nb\n");
  });

  it("preserves CRLF line endings", () => {
    expect(stripTrailingBlankLines("a\r\n\\\r\n\r\n")).toBe("a\r\n");
  });

  it("is idempotent", () => {
    const once = stripTrailingBlankLines("a\n\\\n\n");
    expect(stripTrailingBlankLines(once)).toBe(once);
  });
});
