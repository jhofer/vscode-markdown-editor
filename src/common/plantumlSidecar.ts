/**
 * Pure helpers for the "external PlantUML files" feature: moving PlantUML
 * source out of the markdown into a `<name>.plantuml` sidecar file, and
 * replacing it in the markdown with a generated-SVG image link.
 *
 * No `vscode` / `fs` imports here — see src/host/plantUmlExternalFiles.ts for
 * the disk/vscode side.
 */

export interface Diagram {
  name: string;
  source: string;
}

/**
 * Everything needed to compute the on-disk paths and markdown links for a
 * document's diagrams. `attachmentsFolder` and `relDir` are posix-style,
 * with no leading/trailing slashes ("" means "repository root" / "same
 * directory as the markdown file").
 */
export interface DocumentLayout {
  attachmentsFolder: string;
  relDir: string;
  baseName: string;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strips a leading `@startuml [name]` and trailing `@enduml` line (each
 * optionally backslash-escaped) from `content`, returning the captured name
 * (if any) and the remaining inner source. Trailing blank lines are trimmed
 * before looking for `@enduml`, mirroring the client-side parser so both
 * sides agree on what "the source" is.
 */
function splitUmlDelimiters(content: string): {
  name: string | null;
  source: string;
} {
  const lines = content.split(/\r?\n/);
  let start = 0;
  let end = lines.length;
  let name: string | null = null;

  while (end > start && lines[end - 1].trim() === "") {
    end--;
  }

  const firstLine = start < end ? lines[start].trim() : "";
  const startMatch = /^\\?@startuml\b[ \t]*(\S+)?/i.exec(firstLine);
  if (startMatch) {
    name = startMatch[1] ?? null;
    start++;
  }

  if (end > start && /^\\?@enduml[ \t]*$/i.test(lines[end - 1].trim())) {
    end--;
  }

  return { name, source: lines.slice(start, end).join("\n") };
}

interface RawMatch {
  kind: "fence" | "legacy";
  start: number;
  end: number;
  name: string | null;
  source: string;
}

function findFenceMatches(markdown: string): RawMatch[] {
  const re = /```plantuml[ \t]*\r?\n([\s\S]*?)\r?\n```/g;
  const matches: RawMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown))) {
    const { name, source } = splitUmlDelimiters(m[1]);
    matches.push({
      kind: "fence",
      start: m.index,
      end: m.index + m[0].length,
      name,
      source,
    });
  }
  return matches;
}

function findLegacyMatches(markdown: string): RawMatch[] {
  const re =
    /(^|\n)([ \t]*\\?@startuml\b[^\r\n]*\r?\n[\s\S]*?\r?\n[ \t]*\\?@enduml[ \t]*)(?=\r?\n|$)/gi;
  const matches: RawMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown))) {
    const prefixLen = m[1] ? m[1].length : 0;
    const start = m.index + prefixLen;
    const end = m.index + m[0].length;
    const { name, source } = splitUmlDelimiters(m[2]);
    matches.push({ kind: "legacy", start, end, name, source });
  }
  return matches;
}

/** Fenced and legacy-bare PlantUML blocks, in document order, non-overlapping. */
function findAllMatches(markdown: string): RawMatch[] {
  const fenceMatches = findFenceMatches(markdown);
  const legacyMatches = findLegacyMatches(markdown).filter(
    (lm) => !fenceMatches.some((fm) => lm.start < fm.end && lm.end > fm.start),
  );
  return [...fenceMatches, ...legacyMatches].sort((a, b) => a.start - b.start);
}

/**
 * Assigns a name to every entry that doesn't already have one (or whose name
 * collides with an earlier entry), filling the lowest free `${baseName}-${n}`
 * gap first. Order is preserved.
 *
 * Explicit names are reserved in a first pass so that an auto-numbered entry
 * appearing earlier in the document can never steal a name an entry later in
 * the document explicitly claims — that would silently rename an existing,
 * already-linked diagram.
 */
function allocateNames(
  baseName: string,
  entries: Array<{ name: string | null; source: string }>,
): Diagram[] {
  const reserved = new Set<string>();
  for (const entry of entries) {
    if (entry.name) {
      reserved.add(entry.name);
    }
  }

  const claimed = new Set<string>();
  let next = 1;

  function nextFreeName(): string {
    while (reserved.has(`${baseName}-${next}`) || claimed.has(`${baseName}-${next}`)) {
      next++;
    }
    const name = `${baseName}-${next}`;
    claimed.add(name);
    next++;
    return name;
  }

  return entries.map((entry) => {
    let name = entry.name;
    if (!name || claimed.has(name)) {
      name = nextFreeName();
    } else {
      claimed.add(name);
    }
    return { name, source: entry.source };
  });
}

function fenceMarkdown(diagram: Diagram): string {
  return `\`\`\`plantuml\n@startuml ${diagram.name}\n${diagram.source}\n@enduml\n\`\`\``;
}

function legacyMarkdown(diagram: Diagram): string {
  return `@startuml ${diagram.name}\n${diagram.source}\n@enduml`;
}

/**
 * Parses a `.plantuml` sidecar file into its diagrams. Blocks without a name
 * are assigned the next free `${baseName}-${n}`.
 *
 * Accepts both `@startuml name` (this extension's own format) and
 * `@startuml(name)` (no space) for the name, so sidecars written by other
 * tooling using the parenthesized convention are still recognized on read.
 * Sidecars are always re-serialized (on save) using the space-separated
 * form — see `serializeSidecar`.
 */
export function parseSidecar(text: string, baseName: string): Diagram[] {
  const re =
    /@startuml(?:\(([^)]+)\)|[ \t]+(\S+))?[ \t]*\r?\n([\s\S]*?)\r?\n@enduml[ \t]*(?:\r?\n|$)/g;
  const entries: Array<{ name: string | null; source: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    entries.push({ name: m[1] ?? m[2] ?? null, source: m[3] });
  }
  return allocateNames(baseName, entries);
}

/** Serializes diagrams back into `.plantuml` sidecar file contents. */
export function serializeSidecar(diagrams: Diagram[]): string {
  if (diagrams.length === 0) {
    return "";
  }
  return diagrams.map((d) => `@startuml ${d.name}\n${d.source}\n@enduml`).join("\n\n") + "\n";
}

/** `<attachmentsFolder>/<relDir>/<baseName>` (posix, no leading/trailing slash). */
export function diagramFolder(layout: DocumentLayout): string {
  return [layout.attachmentsFolder, layout.relDir, layout.baseName]
    .filter((part) => !!part)
    .join("/");
}

/** `<diagramFolder>/<name>.svg`, relative to the attachments root. */
export function diagramPath(layout: DocumentLayout, name: string): string {
  return `${diagramFolder(layout)}/${name}.svg`;
}

/** Workspace-relative markdown image link (leading `/`) for a diagram. */
export function diagramLink(layout: DocumentLayout, name: string): string {
  return `/${diagramPath(layout, name)}`;
}

/**
 * Ownership rule 1: `src` is one of this document's diagram images only if
 * it resolves directly into `diagramFolder(layout)` (with or without a
 * leading slash), ends in `.svg`, and its stem is a current diagram name.
 * `http(s)`/`data:` sources and anything else are never claimed.
 */
export function isDiagramLink(
  layout: DocumentLayout,
  src: string,
  names: Set<string> | string[],
): boolean {
  if (!src || /^(https?:)?\/\//i.test(src) || /^data:/i.test(src)) {
    return false;
  }

  const normalized = src.startsWith("/") ? src.slice(1) : src;
  const prefix = `${diagramFolder(layout)}/`;
  if (!normalized.startsWith(prefix)) {
    return false;
  }

  const rest = normalized.slice(prefix.length);
  if (rest.includes("/") || !rest.toLowerCase().endsWith(".svg")) {
    return false;
  }

  const stem = rest.slice(0, -4);
  const nameSet = names instanceof Set ? names : new Set(names);
  return nameSet.has(stem);
}

/**
 * Ownership rule 2: a file in the diagram folder is safe to delete only if
 * its name matches this document's naming scheme (`<baseName>-<n>.svg`) and
 * it is not one of the current diagram names.
 */
export function isPrunableSvg(
  layout: DocumentLayout,
  fileName: string,
  currentNames: Set<string> | string[],
): boolean {
  const re = new RegExp(`^${escapeRegExp(layout.baseName)}-\\d+\\.svg$`, "i");
  if (!re.test(fileName)) {
    return false;
  }
  const stem = fileName.slice(0, -4);
  const nameSet = currentNames instanceof Set ? currentNames : new Set(currentNames);
  return !nameSet.has(stem);
}

/**
 * Replaces every fenced (and legacy bare) PlantUML block with an image link
 * into this document's diagram folder, returning the rewritten markdown and
 * the extracted diagrams (in document order). Everything else — other
 * fences, other images — is left untouched.
 */
export function extractDiagrams(
  markdown: string,
  layout: DocumentLayout,
): { markdown: string; diagrams: Diagram[] } {
  const matches = findAllMatches(markdown);
  if (matches.length === 0) {
    return { markdown, diagrams: [] };
  }

  const diagrams = allocateNames(
    layout.baseName,
    matches.map((m) => ({ name: m.name, source: m.source })),
  );

  let result = "";
  let cursor = 0;
  matches.forEach((match, i) => {
    result += markdown.slice(cursor, match.start);
    const diagram = diagrams[i];
    result += `![${diagram.name}](${diagramLink(layout, diagram.name)})`;
    cursor = match.end;
  });
  result += markdown.slice(cursor);

  return { markdown: result, diagrams };
}

/**
 * The inverse of `extractDiagrams`: replaces image links that belong to this
 * document's diagram folder (per `isDiagramLink`) with the corresponding
 * fenced PlantUML block. Images that fail the ownership check — normal
 * pictures, screenshots that happen to live in the attachments tree, stale
 * links to a diagram that no longer exists — are left exactly as they are.
 */
export function inlineDiagrams(
  markdown: string,
  diagrams: Diagram[],
  layout: DocumentLayout,
): string {
  if (diagrams.length === 0) {
    return markdown;
  }

  const byName = new Map(diagrams.map((d) => [d.name, d] as const));
  const names = new Set(diagrams.map((d) => d.name));
  const imageRe = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

  return markdown.replace(imageRe, (full, _alt, src) => {
    if (!isDiagramLink(layout, src, names)) {
      return full;
    }
    const normalized = src.startsWith("/") ? src.slice(1) : src;
    const stem = normalized.slice(normalized.lastIndexOf("/") + 1, -4);
    const diagram = byName.get(stem);
    return diagram ? fenceMarkdown(diagram) : full;
  });
}

/**
 * Assigns a name to every still-unnamed inline PlantUML block (fenced or
 * legacy bare) without otherwise touching the markdown. Used to migrate
 * existing documents the first time external mode is turned on.
 */
export function nameFences(markdown: string, baseName: string): string {
  const matches = findAllMatches(markdown);
  if (matches.length === 0 || matches.every((m) => m.name)) {
    return markdown;
  }

  const diagrams = allocateNames(
    baseName,
    matches.map((m) => ({ name: m.name, source: m.source })),
  );

  let result = "";
  let cursor = 0;
  matches.forEach((match, i) => {
    result += markdown.slice(cursor, match.start);
    if (match.name) {
      result += markdown.slice(match.start, match.end);
    } else {
      result +=
        match.kind === "fence"
          ? fenceMarkdown(diagrams[i])
          : legacyMarkdown(diagrams[i]);
    }
    cursor = match.end;
  });
  result += markdown.slice(cursor);

  return result;
}
