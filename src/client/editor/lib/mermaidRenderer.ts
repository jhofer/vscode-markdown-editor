/**
 * Client-side Mermaid renderer. Unlike PlantUML (which round-trips to the
 * extension host and a bundled `plantuml.jar`), Mermaid renders entirely in
 * the webview via the `mermaid` npm package — no host message, no Java.
 *
 * The `mermaid` import is lazy so the (large) library is only pulled in when a
 * mermaid node actually renders, and never at module load — keeping it out of
 * `server.ts` / Jest, which never hit this path.
 *
 * Renders are serialized by the caller (DiagramEditorView's per-language
 * queue): mermaid mutates global config and injects elements/ids into the DOM,
 * so concurrent renders interfere.
 */

import type { DiagramRenderResult } from "../components/DiagramEditorView";
import { getCssVar, getCssVarFirst, toHexColor } from "./vscodeThemeColors";

let diagramSeq = 0;

function importMermaid() {
  return import("mermaid").then((m) => m.default);
}

let mermaidPromise: ReturnType<typeof importMermaid> | undefined;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = importMermaid();
  }
  return mermaidPromise;
}

function prefersDarkTheme(): boolean {
  if (typeof document !== "undefined" && document.body) {
    const { classList } = document.body;
    if (
      classList.contains("vscode-dark") ||
      classList.contains("vscode-high-contrast")
    ) {
      return !classList.contains("vscode-high-contrast-light");
    }
    if (
      classList.contains("vscode-light") ||
      classList.contains("vscode-high-contrast-light")
    ) {
      return false;
    }
  }

  // Fall back to the luminance of the editor background.
  const bg = toHexColor(getCssVar("--vscode-editor-background", "#1e1e1e"));
  const hex = bg.replace("#", "");
  if (hex.length >= 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return 0.299 * r + 0.587 * g + 0.114 * b < 128;
  }
  return true;
}

function themeVariables() {
  const background = toHexColor(
    getCssVar("--vscode-editor-background", "#1e1e1e")
  );
  const surface = getCssVarFirst(
    [
      "--vscode-input-background",
      "--vscode-editorWidget-background",
      "--vscode-textCodeBlock-background",
    ],
    "#252526"
  );
  const foreground = getCssVarFirst(
    ["--vscode-editor-foreground", "--vscode-input-foreground"],
    "#d4d4d4"
  );
  const border = getCssVarFirst(
    [
      "--vscode-input-border",
      "--vscode-editorWidget-border",
      "--vscode-contrastBorder",
      "--vscode-focusBorder",
    ],
    foreground
  );
  const accent = getCssVarFirst(
    ["--vscode-textLink-foreground", "--vscode-focusBorder"],
    foreground
  );
  const fontFamily = getCssVar(
    "--vscode-editor-font-family",
    "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace"
  );

  return {
    background,
    primaryColor: surface,
    primaryTextColor: foreground,
    primaryBorderColor: border,
    secondaryColor: surface,
    tertiaryColor: background,
    lineColor: accent,
    textColor: foreground,
    fontFamily,
  };
}

/**
 * Whether the source carries its own `%%{init: ...}%%` directive — in which
 * case the document's config wins and we do not impose the editor theme.
 */
function hasInitDirective(source: string): boolean {
  return /%%\{\s*init\s*:/i.test(source);
}

function svgToDataUri(svg: string): string {
  const base64 = btoa(unescape(encodeURIComponent(svg)));
  return `data:image/svg+xml;base64,${base64}`;
}

export async function renderMermaid(
  source: string
): Promise<DiagramRenderResult> {
  const mermaid = await loadMermaid();

  const config: Record<string, unknown> = {
    startOnLoad: false,
    securityLevel: "strict",
  };
  if (!hasInitDirective(source)) {
    config.theme = prefersDarkTheme() ? "dark" : "default";
    config.themeVariables = themeVariables();
  }
  // mermaid's own MermaidConfig type is stricter than this loose bag; the
  // runtime accepts a partial config.
  mermaid.initialize(config as Parameters<typeof mermaid.initialize>[0]);

  // Validate first: parse() rejects with an Error whose message is the syntax
  // diagnostic, and letting that propagate keeps us from ever calling render()
  // on invalid input — which is what injects mermaid's "bomb" error graphic
  // into the document. DiagramEditorView surfaces the rejection in the preview
  // pane.
  await mermaid.parse(source);

  const id = `mermaid-diagram-${Date.now()}-${diagramSeq++}`;
  const { svg } = await mermaid.render(id, source);

  return { imageData: svgToDataUri(svg) };
}
