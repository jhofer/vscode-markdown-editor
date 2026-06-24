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
}

export function getEditorSettings(): EditorSettings {
  const globals =
    typeof window !== "undefined"
      ? (window as unknown as Record<string, unknown>)
      : undefined;

  return {
    preserveEmptyParagraphs:
      globals?.__RME_PRESERVE_EMPTY_PARAGRAPHS__ === true,
  };
}
