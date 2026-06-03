/**
 * Remove trailing blank lines and trailing empty-paragraph artifacts
 * (lines containing only a single backslash, produced by the editor's
 * Paragraph serializer for empty paragraphs). Interior content is left
 * untouched. Non-empty results are terminated with exactly one newline.
 */
export function stripTrailingBlankLines(text: string): string {
  // Normalize EOL for line-based processing, remember if original used CRLF.
  const usesCrlf = /\r\n/.test(text);
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  // Drop trailing lines that are empty, whitespace-only, or just a
  // single backslash (the empty-paragraph artifact from the serializer).
  const blank = /^[ \t]*\\?[ \t]*$/;
  while (lines.length > 0 && blank.test(lines[lines.length - 1])) {
    lines.pop();
  }

  if (lines.length === 0) {
    return "";
  }

  const eol = usesCrlf ? "\r\n" : "\n";
  return lines.join(eol) + eol;
}
