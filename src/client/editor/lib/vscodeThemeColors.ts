/**
 * Helpers for reading VS Code theme colors out of the CSS custom properties
 * the webview host injects (`--vscode-*`). Shared by the diagram renderers
 * (PlantUML skinparams, Mermaid themeVariables) so a diagram can pick up the
 * editor's palette instead of rendering against a hard-coded light background.
 */

export function getCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined" || !window.getComputedStyle) {
    return fallback;
  }

  const rootValue = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  if (rootValue) {
    return rootValue;
  }

  const bodyValue = document.body
    ? getComputedStyle(document.body).getPropertyValue(name).trim()
    : "";
  return bodyValue || fallback;
}

export function isLowAlphaRgba(value: string): boolean {
  const match = value.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\s*\)/i);
  if (!match) {
    return false;
  }

  const alpha = Number(match[1]);
  return Number.isFinite(alpha) && alpha < 0.45;
}

export function toHexColor(value: string): string {
  const match = value.match(
    /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*[0-9.]+\s*)?\)$/i
  );

  if (!match) {
    return value;
  }

  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const toByteHex = (n: number) => clamp(n).toString(16).padStart(2, "0");

  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);

  return `#${toByteHex(r)}${toByteHex(g)}${toByteHex(b)}`;
}

export function getCssVarFirst(names: string[], fallback: string): string {
  for (const name of names) {
    const value = getCssVar(name, "");
    if (!value || isLowAlphaRgba(value)) {
      continue;
    }
    return toHexColor(value);
  }

  return toHexColor(fallback);
}
