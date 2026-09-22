import * as fs from "fs";

/**
 * Above this the SVG is left to the webview to load as a file — an inline data
 * URI has to travel through every `updateMarkdown` message, so a huge one
 * would be copied on each keystroke.
 */
export const MAX_INLINE_SVG_BYTES = 2 * 1024 * 1024;

/** The same budget, across all the SVGs one document may inline at once. */
export const MAX_INLINE_SVG_TOTAL_BYTES = 8 * 1024 * 1024;

/** Keeps the decoding of unchanged files off the per-keystroke update path. */
const MAX_CACHE_ENTRIES = 64;

interface CacheEntry {
  mtimeMs: number;
  size: number;
  dataUri: string;
}

const cache = new Map<string, CacheEntry>();

/** Exported for tests; a cache keyed on mtime is otherwise invisible. */
export function clearInlineSvgCache(): void {
  cache.clear();
}

export function isSvgPath(filePath: string): boolean {
  return /\.svg$/i.test(filePath);
}

/**
 * Read an SVG off disk as a `data:image/svg+xml` URI, so the webview can render
 * it inline in the DOM instead of through an `<img>` element.
 *
 * An `<img>` renders SVG in the browsers' restricted "secure static mode",
 * which drops `<foreignObject>` content entirely. Draw.io (hediet.vscode-drawio)
 * puts every shape label in a `<foreignObject>`, so its diagrams show up as
 * boxes and arrows with no text at all. Inlining the markup gets the labels
 * back — and, as a side effect, keeps the diagram vector-sharp when zoomed.
 *
 * Returns `undefined` when the file is unreadable or too big to inline; the
 * caller then falls back to the plain webview URI.
 */
export function svgFileToDataUri(fsPath: string): string | undefined {
  try {
    const stat = fs.statSync(fsPath);
    if (!stat.isFile() || stat.size > MAX_INLINE_SVG_BYTES) {
      return undefined;
    }

    const cached = cache.get(fsPath);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return cached.dataUri;
    }

    const dataUri = `data:image/svg+xml;base64,${fs
      .readFileSync(fsPath)
      .toString("base64")}`;

    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next();
      if (!oldest.done) {
        cache.delete(oldest.value);
      }
    }
    cache.set(fsPath, { mtimeMs: stat.mtimeMs, size: stat.size, dataUri });

    return dataUri;
  } catch {
    return undefined;
  }
}
