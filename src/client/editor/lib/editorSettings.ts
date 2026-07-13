/**
 * Editor settings injected by the host into the webview as window globals
 * (see getHtmlForWebview in richMarkdownEditorProvider.ts). Read defensively
 * so the code also works outside the webview (e.g. in unit tests).
 */
export interface EditorSettings {
  /**
   * When true, empty paragraphs are serialized as a backslash hard break so
   * intentional blank lines survive a reload. When false (default), they
   * collapse into ordinary paragraph breaks, keeping the markdown clean.
   */
  preserveEmptyParagraphs: boolean;
  /**
   * When true, the host stores PlantUML sources in a sidecar `.plantuml`
   * file and keeps only a generated SVG link in the markdown. Newly inserted
   * diagrams must therefore be named on insertion (see PlantUml.tsx
   * commands()) so the host doesn't rename them out from under an
   * in-progress edit.
   */
  plantumlExternal: boolean;
  /** The markdown document's basename (no extension), used as the name prefix. */
  plantumlBaseName: string;
}

export function getEditorSettings(): EditorSettings {
  const globals =
    typeof window !== "undefined"
      ? (window as unknown as Record<string, unknown>)
      : undefined;

  return {
    preserveEmptyParagraphs:
      globals?.__RME_PRESERVE_EMPTY_PARAGRAPHS__ === true,
    plantumlExternal: globals?.__RME_PLANTUML_EXTERNAL__ === true,
    plantumlBaseName:
      typeof globals?.__RME_PLANTUML_BASENAME__ === "string"
        ? (globals.__RME_PLANTUML_BASENAME__ as string)
        : "diagram",
  };
}
