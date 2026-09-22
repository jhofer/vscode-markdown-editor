import * as path from "path";

/**
 * Percent-encode the characters that would break a markdown link destination
 * (`![alt](here)`), leaving everything else — non-ASCII file names included —
 * readable in the source. `%` goes first so the escapes introduced below are
 * not encoded a second time.
 */
export function encodeMarkdownPath(filePath: string): string {
  return filePath
    .replace(/%/g, "%25")
    .replace(/\s/g, "%20")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/#/g, "%23")
    .replace(/\?/g, "%3F");
}

/**
 * The path of `targetFsPath` as it should be written into the markdown file at
 * `documentFsPath`: relative to the document's own folder, with forward
 * slashes, and prefixed with `./` when it would otherwise look like a bare
 * name. A file next to the document becomes `./image.png`, one above it
 * `../assets/image.png`. A target no relative path can reach (another Windows
 * drive) keeps the absolute path `path.relative` falls back to.
 */
export function toRelativeMarkdownPath(
  documentFsPath: string,
  targetFsPath: string,
): string {
  const relative = path.relative(path.dirname(documentFsPath), targetFsPath);
  const posix = relative.split(path.sep).join("/");
  if (path.isAbsolute(relative)) {
    return encodeMarkdownPath(posix);
  }

  return encodeMarkdownPath(posix.startsWith(".") ? posix : `./${posix}`);
}

/**
 * The inverse of `encodeMarkdownPath` for resolving a link destination back to
 * a path on disk. Destinations that aren't valid percent-encoding (a file
 * literally named `100%_done.png`) are taken as-is.
 */
export function decodeMarkdownPath(destination: string): string {
  try {
    return decodeURIComponent(destination);
  } catch {
    return destination;
  }
}
