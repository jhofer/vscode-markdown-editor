/**
 * A file dropped onto the editor, resolved by the host into something that can
 * be written into the markdown: a path relative to the markdown document plus
 * whatever the webview needs to render it right away.
 */
export interface DroppedResource {
  /** Path relative to the markdown document, as written into the markdown. */
  rawsrc: string;
  /** Webview URI (or inlined data URI) the webview can render `rawsrc` from. */
  src: string;
  /** Images become `![]()`, everything else a plain link. */
  isImage: boolean;
  /** Image alt text / link text — the dropped file's name. */
  label: string;
}

const IMAGE_EXTENSIONS = [
  "apng",
  "avif",
  "bmp",
  "gif",
  "ico",
  "jfif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "tif",
  "tiff",
  "webp",
];

/** True for paths whose extension is one browsers render as an image. */
export function isImagePath(filePath: string): boolean {
  const match = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(filePath);
  if (!match) {
    return false;
  }

  return IMAGE_EXTENSIONS.includes(match[1].toLowerCase());
}

/** Escape the characters that would end a markdown link's text early. */
function escapeLinkText(text: string): string {
  return text.replace(/([[\]\\])/g, "\\$1");
}

/** The markdown for a dropped file: an image embed, or a plain link. */
export function formatDroppedResource(resource: DroppedResource): string {
  const text = escapeLinkText(resource.label);
  return `${resource.isImage ? "!" : ""}[${text}](${resource.rawsrc})`;
}
