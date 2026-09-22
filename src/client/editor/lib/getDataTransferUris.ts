/**
 * The part of `DataTransfer` this module needs — spelled out so the parsing can
 * be tested without a DOM drag event.
 */
export interface DataTransferLike {
  types?: readonly string[];
  getData(format: string): string;
}

/**
 * Drag payloads VS Code puts on a drop from the explorer or an editor tab, in
 * the order we trust them. `text/uri-list` is the standard one; `codefiles`
 * carries plain filesystem paths and `resourceurls` a JSON array of (sometimes
 * percent-encoded) URI strings.
 */
const URI_LIST_FORMATS = ["text/uri-list"];
const JSON_LIST_FORMATS = ["codefiles", "resourceurls"];

const DROP_FORMATS = [...URI_LIST_FORMATS, ...JSON_LIST_FORMATS];

const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]+:/;

/**
 * Whether a drag announces files at all. `getData` is blocked while a drag is
 * in progress — only `types` can be read — so this is what a `dragover`
 * handler has to go on when deciding whether to accept the drop.
 */
export function announcesDroppableUris(
  dataTransfer: DataTransferLike | null | undefined,
): boolean {
  const types = dataTransfer?.types;
  if (!types) {
    return false;
  }

  return Array.from(types).some((type) => DROP_FORMATS.includes(type));
}

function parseUriList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    // A uri-list may carry `#`-prefixed comment lines.
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function parseJsonList(value: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => {
      if (SCHEME_PATTERN.test(entry)) {
        return entry;
      }

      // `resourceurls` entries can be percent-encoded whole.
      try {
        return decodeURIComponent(entry);
      } catch {
        return entry;
      }
    })
    .filter((entry) => entry.length > 0);
}

function readData(dataTransfer: DataTransferLike, format: string): string {
  try {
    return dataTransfer.getData(format) || "";
  } catch {
    return "";
  }
}

/**
 * The file URIs (or filesystem paths) behind a drop, or an empty array when the
 * drop carries something else — dragged text, for instance, which must keep
 * falling through to the editor's normal handling.
 */
export default function getDataTransferUris(
  dataTransfer: DataTransferLike | null | undefined,
): string[] {
  if (!dataTransfer) {
    return [];
  }

  const found: string[] = [];
  for (const format of URI_LIST_FORMATS) {
    found.push(...parseUriList(readData(dataTransfer, format)));
  }
  for (const format of JSON_LIST_FORMATS) {
    found.push(...parseJsonList(readData(dataTransfer, format)));
  }

  if (found.length === 0) {
    // Last resort: a drop that only announces a path. Anything that isn't a
    // `file:` URI is left alone so dragged text still pastes as text.
    const text = readData(dataTransfer, "text/plain").trim();
    if (/^file:\/\//i.test(text)) {
      found.push(text);
    }
  }

  return Array.from(new Set(found));
}
