/**
 * The markdown document's prevailing style, inferred from its content at parse
 * time (see rules/documentStyle.ts) and used as the default for list nodes
 * *created while editing* — nesting with Tab, or toggling a paragraph into a
 * list — so a `*`-bulleted document doesn't sprout `-` children on the first
 * edit. Nodes that came from the file already carry their own markup attrs and
 * don't consult this.
 *
 * Module-level singleton, mirroring lib/editorSettings.ts: one webview hosts
 * exactly one document, and the parser rewrites this on every load / raw-mode
 * switch. Defaults match the historical hard-coded literals, so an empty or
 * ambiguous document behaves exactly as before.
 */
export interface DocumentStyle {
  /** Dominant bullet marker: "-", "*" or "+". */
  bullet: string;
  /** Dominant ordered-list delimiter: "." or ")". */
  orderedDelimiter: string;
  /** Whether ordered lists count up ("ordinal") or repeat one number ("one"). */
  orderedCounter: "ordinal" | "one";
}

const DEFAULT_STYLE: DocumentStyle = {
  bullet: "-",
  orderedDelimiter: ".",
  orderedCounter: "ordinal",
};

let current: DocumentStyle = { ...DEFAULT_STYLE };

export function getDocumentStyle(): DocumentStyle {
  return current;
}

export function setDocumentStyle(style: Partial<DocumentStyle>): void {
  current = { ...DEFAULT_STYLE, ...style };
}

export function resetDocumentStyle(): void {
  current = { ...DEFAULT_STYLE };
}
