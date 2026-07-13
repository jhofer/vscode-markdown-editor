import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import logger from "./logger";
import { PlantUmlRenderer } from "./plantUmlRenderer";
import { DEFAULT_PLANTUML_ATTACHMENTS_FOLDER } from "./constants";
import {
  Diagram,
  DocumentLayout,
  diagramFolder,
  isPrunableSvg,
  parseSidecar,
  serializeSidecar,
} from "../common/plantumlSidecar";

export interface DiagramDocumentLayout extends DocumentLayout {
  sidecarPath: string;
  diagramDir: string;
}

/**
 * Normalizes the `inkwell-md.plantumlAttachmentsFolder` setting: posix
 * separators, no leading/trailing slashes, and no escaping the root — an
 * absolute path or a ".." segment falls back to the default and logs a
 * warning rather than writing outside the intended attachments tree.
 */
export function normalizeAttachmentsFolder(value: string | undefined): string {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return DEFAULT_PLANTUML_ATTACHMENTS_FOLDER;
  }

  const isAbsolute =
    path.isAbsolute(trimmed) ||
    path.win32.isAbsolute(trimmed) ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("\\");

  const posix = trimmed.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const segments = posix.split("/").filter((s) => s.length > 0);

  if (isAbsolute || segments.some((s) => s === "..")) {
    logger.logWarning(
      `Invalid inkwell-md.plantumlAttachmentsFolder "${value}" (must be a relative path with no ".." segments). Falling back to "${DEFAULT_PLANTUML_ATTACHMENTS_FOLDER}".`,
    );
    return DEFAULT_PLANTUML_ATTACHMENTS_FOLDER;
  }

  return segments.join("/") || DEFAULT_PLANTUML_ATTACHMENTS_FOLDER;
}

/**
 * Computes the sidecar/diagram-folder layout for a document, or undefined if
 * the document doesn't live under `root` (external mode is skipped then).
 */
export function layoutFor(
  document: vscode.TextDocument,
  root: string,
  attachmentsFolder: string,
): DiagramDocumentLayout | undefined {
  const fsPath = document.uri.fsPath;
  const relPath = path.relative(root, fsPath);
  if (!relPath || relPath.startsWith("..") || path.isAbsolute(relPath)) {
    return undefined;
  }

  const relPosix = relPath.split(path.sep).join("/");
  const relDirRaw = path.posix.dirname(relPosix);
  const ext = path.extname(relPosix);
  const baseName = path.posix.basename(relPosix, ext);

  const layout: DocumentLayout = {
    attachmentsFolder,
    relDir: relDirRaw === "." ? "" : relDirRaw,
    baseName,
  };

  const sidecarPath = path.join(path.dirname(fsPath), `${baseName}.plantuml`);
  const diagramDir = path.join(root, ...diagramFolder(layout).split("/"));

  return { ...layout, sidecarPath, diagramDir };
}

/** Reads and parses the sidecar file for a document; [] if it doesn't exist. */
export function readSidecar(layout: DiagramDocumentLayout): Diagram[] {
  if (!fs.existsSync(layout.sidecarPath)) {
    return [];
  }
  const text = fs.readFileSync(layout.sidecarPath, "utf8");
  return parseSidecar(text, layout.baseName);
}

/**
 * Writes the sidecar file, (re-)renders any diagram whose source changed (or
 * whose SVG is missing), and prunes SVGs that belong to this document's
 * naming scheme but are no longer current — never touching anything else in
 * the diagram folder or outside it.
 */
export async function writeDiagrams(
  layout: DiagramDocumentLayout,
  diagrams: Diagram[],
  previous: Diagram[],
  renderer: PlantUmlRenderer,
): Promise<void> {
  if (diagrams.length === 0) {
    if (fs.existsSync(layout.sidecarPath)) {
      fs.unlinkSync(layout.sidecarPath);
    }
  } else {
    fs.writeFileSync(layout.sidecarPath, serializeSidecar(diagrams), "utf8");
  }

  const previousByName = new Map(previous.map((d) => [d.name, d.source]));
  const currentNames = new Set(diagrams.map((d) => d.name));

  if (diagrams.length > 0) {
    fs.mkdirSync(layout.diagramDir, { recursive: true });
  }

  const failures: string[] = [];
  for (const diagram of diagrams) {
    const svgPath = path.join(layout.diagramDir, `${diagram.name}.svg`);
    const upToDate =
      previousByName.get(diagram.name) === diagram.source && fs.existsSync(svgPath);
    if (upToDate) {
      continue;
    }
    try {
      const svg = await renderer.renderToSvg(
        `@startuml ${diagram.name}\n${diagram.source}\n@enduml`,
      );
      fs.writeFileSync(svgPath, svg, "utf8");
    } catch (error) {
      logger.logError(error);
      failures.push(`${diagram.name}: ${String(error)}`);
    }
  }

  if (fs.existsSync(layout.diagramDir)) {
    for (const fileName of fs.readdirSync(layout.diagramDir)) {
      if (isPrunableSvg(layout, fileName, currentNames)) {
        fs.unlinkSync(path.join(layout.diagramDir, fileName));
      }
    }
    if (fs.readdirSync(layout.diagramDir).length === 0) {
      fs.rmdirSync(layout.diagramDir);
    }
  }

  if (failures.length > 0) {
    vscode.window.showErrorMessage(
      `inkwell.md: failed to render ${failures.length} PlantUML diagram(s). See the "inkwell.md" output channel for details.`,
    );
  }
}
