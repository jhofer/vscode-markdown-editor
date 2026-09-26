import * as vscode from "vscode";
import * as fs from "fs";
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  DEFAULT_PLANTUML_ATTACHMENTS_FOLDER,
  DEFAULT_PLANTUML_EXTERNAL_FILES,
} from "./constants";

import { getNonce } from "../utils/getNonce";
import path from "path";
import logger from "./logger";
import { HostMessageBroker } from "./hostMessageBroker";
import { IMessage } from "../common/messages";
import { updateMarkdownMessage } from "../common/messages/updateMarkdown";
import { uploadImageMessage } from "../common/messages/uploadImage";
import { searchLinkMessage } from "../common/messages/searchLink";
import { openLinkMessage } from "../common/messages/openLink";
import { readyMessage } from "../common/messages/ready";
import { initMessage } from "../common/messages/init";
import { requestCompletionMessage } from "../common/messages/requestCompletion";
import { renderPlantUmlMessage } from "../common/messages/renderPlantUml";
import { dropResourcesMessage } from "../common/messages/dropResources";
import { resolveAzureDevOpsMessage } from "../common/messages/resolveAzureDevOps";
import {
  DroppedResource,
  isImagePath,
} from "../common/droppedResources";
import {
  decodeMarkdownPath,
  toRelativeMarkdownPath,
} from "./droppedResources";
import {
  MAX_INLINE_SVG_TOTAL_BYTES,
  isSvgPath,
  svgFileToDataUri,
} from "./inlineSvg";
import { CopilotProvider } from "./copilotProvider";
import { PlantUmlRenderer } from "./plantUmlRenderer";
import { AzureDevOpsClient, getAzureDevOpsPat } from "./azureDevOpsClient";
import { stripTrailingBlankLines } from "../common/stripTrailingBlankLines";
import {
  Diagram,
  extractDiagrams,
  inlineDiagrams,
  mergeDiagrams,
  nameFences,
  reconcileSidecar,
} from "../common/plantumlSidecar";
import {
  DiagramDocumentLayout,
  layoutFor,
  normalizeAttachmentsFolder,
  readSidecar,
  renderDiagrams,
  writeDiagrams,
} from "./plantUmlExternalFiles";

/**
 * How long to wait after a change to the `.plantuml` sidecar before reloading
 * it. A single external edit often lands as several filesystem events (write,
 * truncate, rename-into-place); coalescing them keeps us from re-rendering the
 * diagrams once per event, and gives a half-written file a moment to settle.
 */
const SIDECAR_RELOAD_DEBOUNCE_MS = 150;

// Per-document editor context
interface EditorContext {
  webviewPanel: vscode.WebviewPanel;
  document: vscode.TextDocument;
  messageBroker: HostMessageBroker;
  plantumlExternal: boolean;
  diagramLayout?: DiagramDocumentLayout;
  // Diagrams as currently known from the live editor session (kept in sync on
  // every webview -> doc round trip); used to re-inline diagrams into fences
  // for the webview and as the payload for the next sidecar write.
  diagrams: Diagram[];
  // Diagrams as of the last successful sidecar write; used to skip
  // re-rendering diagrams whose source hasn't changed since that write.
  lastWritten: Diagram[];
  // Revisions of in-flight updateMarkdown requests, oldest first, queued
  // right before the edit that will satisfy them is applied and dequeued by
  // onDidChangeTextDocument as each edit's change event fires (edits on one
  // document are applied and fire change events in the order they were
  // requested). Lets the client that sent them tell a superseded request's
  // response apart from the one for its latest edit.
  pendingRevisions: number[];
  // Chains document edits so each one is applied only after the previous one
  // has landed (see updateTextDocument).
  documentEdits: Promise<unknown>;
  // Serializes everything that touches the sidecar/SVGs on disk (saving,
  // reloading after an external edit) so two of them can never render the
  // same SVG file concurrently or interleave their writes.
  diagramWork: Promise<void>;
}

export class RichMarkdownEditorProvider
  implements vscode.CustomTextEditorProvider
{
  // Map of document URI to editor context
  private editors: Map<string, EditorContext> = new Map();
  private copilotProvider = new CopilotProvider();
  private plantUmlRenderer: PlantUmlRenderer;
  private azureDevOpsClient = new AzureDevOpsClient();

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new RichMarkdownEditorProvider(context);
    const providerRegistration = vscode.window.registerCustomEditorProvider(
      RichMarkdownEditorProvider.viewType,
      provider,
    );
    return providerRegistration;
  }

  public static readonly viewType = "inkwell.md";

  constructor(private readonly context: vscode.ExtensionContext) {
    this.plantUmlRenderer = new PlantUmlRenderer(context.extensionUri.fsPath);
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("inkwell-md.azureDevOps")) {
          this.azureDevOpsClient.clear();
        }
      }),
    );
  }

  dataURItoBuffer = (dataURI: string) => {
    const byteString = Buffer.from(dataURI.split(",")[1], "base64");
    return byteString;
  };

  /**
   * Turn one dropped URI into what the webview needs to write it into the
   * markdown. VS Code hands over a reference to a file that already exists on
   * disk, so nothing is copied: the markdown just points at it, relative to
   * the document being edited (see toRelativeMarkdownPath). Anything that
   * isn't a local file (an http URL, an unsaved editor) is dropped.
   */
  private resolveDroppedResource(
    ctx: EditorContext,
    dropped: string,
  ): DroppedResource | undefined {
    let uri: vscode.Uri;
    try {
      // `codefiles` payloads carry bare filesystem paths; a Windows drive
      // letter must not be mistaken for a URI scheme, hence the two-character
      // minimum before the colon.
      uri = /^[a-zA-Z][a-zA-Z0-9+.-]+:/.test(dropped)
        ? vscode.Uri.parse(dropped, true)
        : vscode.Uri.file(dropped);
    } catch (error) {
      logger.logDebug("Ignoring unparseable dropped uri", { dropped, error });
      return undefined;
    }

    if (uri.scheme !== "file") {
      logger.logDebug("Ignoring dropped uri with unsupported scheme", {
        dropped,
      });
      return undefined;
    }

    // Dropping a file onto its own document would insert a link to itself.
    if (uri.fsPath === ctx.document.uri.fsPath) {
      return undefined;
    }

    const rawsrc = toRelativeMarkdownPath(ctx.document.uri.fsPath, uri.fsPath);
    const isImage = isImagePath(uri.fsPath);
    const inlined =
      isImage && isSvgPath(uri.fsPath) ? svgFileToDataUri(uri.fsPath) : undefined;

    return {
      rawsrc,
      src: inlined ?? ctx.webviewPanel.webview.asWebviewUri(uri).toString(),
      isImage,
      // An image's label becomes its caption, where the extension is just
      // noise; a link's text is the file name as it is on disk.
      label: isImage ? path.parse(uri.fsPath).name : path.basename(uri.fsPath),
    };
  }

  private updateWebview(ctx: EditorContext, revision?: number) {
    const rawMarkdown = ctx.document.getText();
    let markdown = rawMarkdown;

    if (ctx.plantumlExternal && ctx.diagramLayout) {
      // Assign stable names to any still-unnamed inline fences (migration of
      // documents not yet externalized), then reconstitute this document's
      // own externalized diagrams (per the ownership rules) as fences so the
      // rich-text editor always sees inline PlantUML source, never a generated
      // image. `rawMarkdown` (sent separately below) stays untouched, so raw
      // markdown mode mirrors exactly what's saved to disk.
      markdown = nameFences(markdown, ctx.diagramLayout.baseName);
      markdown = inlineDiagrams(markdown, ctx.diagrams, ctx.diagramLayout);
    }

    const rootFolderPath = vscode.Uri.file(this.getPathRootFolder(ctx.document));

    // create an array of all urls of the image tags
    let urlLookUp: Record<string, string> = {};
    if (markdown) {
      const extractImageTags = /!\[(?<alt>[^\]]*?)\]\((?<filename>[^)]+?)\)/g;

      const imageRawUrls: string[] = [];
      let matches;
      while ((matches = extractImageTags.exec(markdown)) !== null) {
        if (matches.groups?.filename) {
          imageRawUrls.push(matches.groups.filename);
        }
      }

      const documentDir = vscode.Uri.file(
        path.dirname(ctx.document.uri.fsPath),
      );

      let inlinedBytes = 0;
      urlLookUp = imageRawUrls.reduce(
        (acc: Record<string, string>, url: string) => {
          if (url.startsWith("http")) {
            acc[url] = url;
            return acc;
          } else {
            // A link destination is percent-encoded markdown ("my%20pic.png"),
            // a filesystem path is not.
            const decodedUrl = decodeMarkdownPath(url);

            let onDiskPath: vscode.Uri;
            if (decodedUrl.startsWith("/")) {
              // Workspace-relative path (leading '/' means relative to the git repository
              // root, or the workspace root if the document isn't part of a git repository)
              const cleanUrl = decodedUrl.substring(1);
              onDiskPath = vscode.Uri.joinPath(rootFolderPath, cleanUrl);
            } else {
              // Document-relative path (resolve against the containing file's directory)
              onDiskPath = vscode.Uri.joinPath(documentDir, decodedUrl);
            }
            const src = ctx.webviewPanel.webview.asWebviewUri(onDiskPath);

            const exists = fs.existsSync(onDiskPath.fsPath);
            logger.logDebug("Image URL mapping:", {
              original: url,
              onDisk: onDiskPath.toString(),
              webview: src?.toString(),
              exists,
            });
            if (!exists) {
              logger.logDebug(
                `Image not found on disk (the webview will render nothing): ${onDiskPath.fsPath}`,
              );
            }

            // An SVG travels as its own markup so the webview can render it
            // inline; see svgFileToDataUri for why an <img> is not enough. The
            // budget keeps a document full of large diagrams from copying
            // megabytes into every update message.
            const inlined =
              exists &&
              isSvgPath(onDiskPath.fsPath) &&
              inlinedBytes < MAX_INLINE_SVG_TOTAL_BYTES
                ? svgFileToDataUri(onDiskPath.fsPath)
                : undefined;
            if (inlined) {
              inlinedBytes += inlined.length;
            }

            acc[url] = inlined ?? src.toString();
            return acc;
          }
        },
        urlLookUp,
      );
    }

    const message = updateMarkdownMessage.response(
      markdown || "",
      urlLookUp,
      rawMarkdown || "",
      revision,
    );
    logger.logDebug("updateWebview", message);
    ctx.messageBroker.sendMessage(message);
  }

  private onDidChangeTextDocument(e: vscode.TextDocumentChangeEvent) {
    if (e.contentChanges.length === 0) {
      return;
    }

    // Find the editor context for this document
    const ctx = this.editors.get(e.document.uri.toString());
    if (ctx) {
      // If this change is satisfying one of our own queued edits, it's the
      // oldest one still pending (see `pendingRevisions` on EditorContext).
      // Otherwise (queue empty) this change came from outside our own
      // requests entirely, and the update is unconditionally authoritative.
      const revision = ctx.pendingRevisions.shift();
      this.updateWebview(ctx, revision);
    }
  }

  private async fileSearchResult(
    text: string,
    document: vscode.TextDocument,
  ): Promise<string[]> {
    const workspace = this.getWorkspaceFolder(document);
    const documentDir = path.dirname(document.uri.fsPath);

    // Exclude common build-output and dependency folders.
    // vscode.workspace.findFiles also respects the workspace's files.exclude
    // setting (which honours .gitignore when "Use .gitignore" is enabled).
    const excludePattern =
      "{**/node_modules/**,**/.git/**,**/bin/**,**/obj/**,**/dist/**,**/out/**,**/build/**}";

    const uris = await vscode.workspace.findFiles(
      new vscode.RelativePattern(workspace, "**/*"),
      excludePattern,
    );

    const files = uris
      .map((uri) => path.relative(documentDir, uri.fsPath))
      .map((file) => file.replace(/\\/g, "/"))
      .map((file) => (file.startsWith(".") ? file : `./${file}`));

    logger.logDebug("files:");
    logger.logDebug(files);
    const results = files.filter((file) =>
      file.toLocaleLowerCase().includes(text.toLocaleLowerCase()),
    );
    logger.logDebug("filtered:");
    logger.logDebug(results);
    return results;
  }

  /**
   * Called when our custom editor is opened.
   */
  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    // The custom editor is registered with priority "option", so it is only
    // opened when explicitly requested (e.g. via "Open With" or the auto-switch
    // in extension.ts for regular file: opens). Non-file URIs (git:, etc.) are
    // therefore not expected here, but guard defensively just in case.
    if (document.uri.scheme !== "file") {
      webviewPanel.dispose();
      return;
    }

    const documentUri = document.uri.toString();

    // Setup initial content for the webview
    webviewPanel.webview.options = {
      enableScripts: true,
      // `localResourceRoots` defaults to the open workspace folders plus the
      // extension directory, but `/`-rooted image and link paths resolve
      // against the *git repository root* (getPathRootFolder) and relative
      // ones against the document's own folder — neither is guaranteed to sit
      // inside a workspace folder (a wiki opened below its repo root, a repo
      // opened as a subfolder, a multi-repo workspace). Any image outside the
      // default roots still gets a perfectly well-formed `vscode-resource`
      // URL, which the webview then silently refuses to load: the picture just
      // never appears. Declare the roots we actually resolve against.
      localResourceRoots: this.getLocalResourceRoots(document),
    };

    const messageBroker = new HostMessageBroker(webviewPanel, documentUri);

    const plantumlExternal = vscode.workspace
      .getConfiguration("inkwell-md")
      .get("plantumlExternalFiles", DEFAULT_PLANTUML_EXTERNAL_FILES);
    const attachmentsFolder = normalizeAttachmentsFolder(
      vscode.workspace
        .getConfiguration("inkwell-md")
        .get("plantumlAttachmentsFolder", DEFAULT_PLANTUML_ATTACHMENTS_FOLDER),
    );

    let diagramLayout: DiagramDocumentLayout | undefined;
    let initialDiagrams: Diagram[] = [];
    if (plantumlExternal) {
      try {
        const root = this.getPathRootFolder(document);
        diagramLayout = layoutFor(document, root, attachmentsFolder);
        if (diagramLayout) {
          initialDiagrams = readSidecar(diagramLayout);
        }
      } catch (error) {
        logger.logError(error);
      }
    }

    // Create and store the editor context
    const ctx: EditorContext = {
      webviewPanel,
      document,
      messageBroker,
      plantumlExternal: plantumlExternal === true,
      diagramLayout,
      diagrams: initialDiagrams,
      lastWritten: initialDiagrams,
      pendingRevisions: [],
      documentEdits: Promise.resolve(),
      diagramWork: Promise.resolve(),
    };
    this.editors.set(documentUri, ctx);

    webviewPanel.webview.html = this.getHtmlForWebview(
      webviewPanel.webview,
      documentUri,
    );

    // Register message handlers
    messageBroker.registerHandler(
      updateMarkdownMessage.requestType,
      (message: unknown) => {
        const msg = message as IMessage<{ markdownText: string; revision: number }>;
        let markdownText = msg.payload.markdownText;
        if (ctx.plantumlExternal && ctx.diagramLayout) {
          const extracted = extractDiagrams(markdownText, ctx.diagramLayout);
          markdownText = extracted.markdown;
          ctx.diagrams = mergeDiagrams(ctx.diagrams, extracted.diagrams, markdownText);
        }
        this.updateTextDocument(ctx, markdownText, msg.payload.revision);
      },
    );

    // Register handler for "ready" message
    messageBroker.registerHandler(readyMessage.requestType, () => {
      // When the client is ready, send the current markdown content
      this.updateWebview(ctx);
    });

    // Register handler for image upload
    messageBroker.registerHandler(
      uploadImageMessage.requestType,
      async (message: unknown) => {
        const msg = message as IMessage<{ fileName: string; imageUrl: string }>;
        try {
          const buffer = this.dataURItoBuffer(msg.payload.imageUrl);
          const parts = ["2024-10-22", "T", "11:53:48"];
          const part = parts.join("");
          const isoTimestamp = new Date()
            .toISOString()
            .slice(0, part.length - 1);
          const date = isoTimestamp.split("T")[0].replace(/-/g, "");
          const time = isoTimestamp
            .split("T")[1]
            .slice(0, parts[2].length - 1)
            .replace(/:/g, "");

          const timestamp = `${date}${time}`;
          const ext = msg.payload.fileName.split(".").pop();
          const fileNameWithoutExtension = msg.payload.fileName.replace(
            /\.[^/.]+$/,
            "",
          );
          const fileName = `${fileNameWithoutExtension}-${timestamp}.${ext}`;

          const rootFolderPath = this.getPathRootFolder(ctx.document);
          const imagesFolder = "images";

          const imageFolderPath = path.join(rootFolderPath, imagesFolder);
          if (!fs.existsSync(imageFolderPath)) {
            fs.mkdirSync(imageFolderPath);
          }
          const filePath = path.join(imageFolderPath, fileName);
          fs.writeFileSync(filePath, buffer);
          const relativePath = path.relative(rootFolderPath, filePath);

          const rawsrc = `/${relativePath.replace(/\\/g, "/")}`;
          const src = ctx.webviewPanel.webview
            .asWebviewUri(vscode.Uri.file(filePath))
            .toString();

          const responseMsg = uploadImageMessage.response(src, rawsrc);
          ctx.messageBroker.sendMessage(responseMsg);
        } catch (e) {
          const error = e as Error;
          const errorMsg = uploadImageMessage.error(error?.message);
          logger.logError(e);
          ctx.messageBroker.sendMessage(errorMsg);
        }
      },
    );

    // Register handler for files dropped onto the editor
    messageBroker.registerHandler(
      dropResourcesMessage.requestType,
      (message: unknown) => {
        const msg = message as IMessage<{ uris: string[] }>;
        try {
          const resources = (msg.payload.uris || [])
            .map((uri) => this.resolveDroppedResource(ctx, uri))
            .filter((resource): resource is DroppedResource => !!resource)
            // Two spellings of the same file (a URI and a plain path) resolve
            // to the same link; insert it once.
            .filter(
              (resource, index, all) =>
                all.findIndex((other) => other.rawsrc === resource.rawsrc) ===
                index,
            );

          logger.logDebug(
            "dropResources",
            // Not the resources themselves: an inlined SVG's `src` is its
            // whole markup.
            resources.map(({ rawsrc, isImage }) => ({ rawsrc, isImage })),
          );
          ctx.messageBroker.sendMessage(
            dropResourcesMessage.response(resources),
          );
        } catch (e) {
          const error = e as Error;
          logger.logError(e);
          ctx.messageBroker.sendMessage(
            dropResourcesMessage.error(error?.message ?? String(e)),
          );
        }
      },
    );

    // Register handler for link clicks
    messageBroker.registerHandler(
      openLinkMessage.requestType,
      async (message: unknown) => {
        const msg = message as IMessage<string>;
        const href = msg.payload;
        const uri = vscode.Uri.parse(href);
        logger.logDebug("openLink", uri.scheme);
        if (uri.scheme === "vscode-webview") {
          await this.openDocument(uri, ctx.document);
        } else if (!uri.scheme || uri.scheme === "file") {
          // Local file link: relative (e.g. ./other.md) or workspace-relative (e.g. /docs/page.md)
          await this.openLocalPath(href, ctx.document);
        } else {
          vscode.env.openExternal(vscode.Uri.parse(href));
        }
      },
    );

    // Register handler for link search
    messageBroker.registerHandler(
      searchLinkMessage.requestType,
      async (message: unknown) => {
        const msg = message as IMessage<string>;
        const searchTerm = msg.payload;
        logger.logDebug("searchLink", searchTerm);
        const result = await this.fileSearchResult(searchTerm, ctx.document);
        logger.logDebug("searchLink result", result);
        const responseMsg = searchLinkMessage.response(result);
        ctx.messageBroker.sendMessage(responseMsg);
      },
    );

    // Register handler for Copilot completion requests
    messageBroker.registerHandler(
      requestCompletionMessage.requestType,
      async (message: unknown) => {
        const msg = message as IMessage<any>;
        try {
          const suggestions = await this.copilotProvider.getCompletion(
            msg.payload,
          );
          const responseMsg = requestCompletionMessage.response(suggestions);
          ctx.messageBroker.sendMessage(responseMsg);
        } catch (error) {
          logger.logDebug("Completion error", { error: String(error) });
          const errorMsg = requestCompletionMessage.error(String(error));
          ctx.messageBroker.sendMessage(errorMsg);
        }
      },
    );

    // Register handler for PlantUML rendering
    messageBroker.registerHandler(
      renderPlantUmlMessage.requestType,
      async (message: unknown) => {
        const msg = message as IMessage<{ source: string }>;
        try {
          const imageData = await this.plantUmlRenderer.renderToDataUri(
            msg.payload.source,
          );
          const responseMsg = renderPlantUmlMessage.response(
            imageData,
            "image/svg+xml"
          );
          ctx.messageBroker.sendMessage(responseMsg);
        } catch (error) {
          logger.logError(error);
          const errorMsg = renderPlantUmlMessage.error(String(error));
          ctx.messageBroker.sendMessage(errorMsg);
        }
      },
    );

    // Register handler for Azure DevOps work item / user lookups
    messageBroker.registerHandler(
      resolveAzureDevOpsMessage.requestType,
      async (message: unknown) => {
        const msg = message as IMessage<{
          workItemIds: number[];
          userIds: string[];
        }>;
        try {
          const organization = this.azureDevOpsClient.resolveOrganization(
            this.findGitRepositoryRoot(ctx.document.uri.fsPath),
          );
          if (!organization) {
            ctx.messageBroker.sendMessage(
              resolveAzureDevOpsMessage.error(
                "No Azure DevOps organization: set inkwell-md.azureDevOps.organization",
              ),
            );
            return;
          }
          const result = await this.azureDevOpsClient.resolve(
            organization,
            msg.payload.workItemIds ?? [],
            msg.payload.userIds ?? [],
          );
          ctx.messageBroker.sendMessage(
            resolveAzureDevOpsMessage.response(result),
          );
        } catch (error) {
          logger.logError(error);
          ctx.messageBroker.sendMessage(
            resolveAzureDevOpsMessage.error(String(error)),
          );
        }
      },
    );

    // Send init message to the webview
    const msg = initMessage.response();
    messageBroker.sendMessage(msg);

    // Hook up event handlers so that we can synchronize the webview with the text document.
    //
    // The text document acts as our model, so we have to sync change in the document to our
    // editor and sync changes in the editor back to the document.
    //
    // Remember that a single text document can also be shared between multiple custom
    // editors (this happens for example when you split a custom editor)

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      this.onDidChangeTextDocument.bind(this),
    );

    // Write the sidecar/SVGs only on save, not on every keystroke.
    const saveDocumentSubscription = vscode.workspace.onDidSaveTextDocument(
      (savedDocument) => {
        if (savedDocument.uri.toString() !== documentUri) {
          return;
        }
        if (!ctx.plantumlExternal || !ctx.diagramLayout) {
          return;
        }
        const layout = ctx.diagramLayout;
        const diagrams = ctx.diagrams;
        this.queueDiagramWork(ctx, async () => {
          await writeDiagrams(
            layout,
            diagrams,
            ctx.lastWritten,
            this.plantUmlRenderer,
          );
          ctx.lastWritten = diagrams;
        });
      },
    );

    // Pick up edits made to the `.plantuml` sidecar outside this editor.
    const sidecarSubscription = this.watchSidecar(ctx);

    // Handle webview state changes (e.g., when switching tabs)
    const viewStateSubscription = webviewPanel.onDidChangeViewState(() => {
      if (webviewPanel.visible && ctx.messageBroker) {
        // When the webview becomes visible again, send the init message first
        // (in case the webview was recreated), then the client will request content via 'ready'
        logger.logDebug("Webview became visible, sending init message");
        const initMsg = initMessage.response();
        ctx.messageBroker.sendMessage(initMsg);
      }
    });

    // Make sure we get rid of the listener when our editor is closed.
    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose();
      saveDocumentSubscription.dispose();
      sidecarSubscription?.dispose();
      viewStateSubscription.dispose();
      // Remove the editor context from the map
      this.editors.delete(documentUri);
    });
  }

  /**
   * Compares two filesystem paths, ignoring case on the platforms whose file
   * systems do (a watcher event can report a different casing than the path we
   * derived the sidecar's name from).
   */
  private isSamePath(a: string, b: string): boolean {
    const normalized = [a, b].map((value) => path.normalize(value));
    return process.platform === "linux"
      ? normalized[0] === normalized[1]
      : normalized[0].toLowerCase() === normalized[1].toLowerCase();
  }

  /**
   * Runs disk work for one document's diagrams, one job at a time.
   *
   * Saving and reloading both write into the same SVG folder, and a render
   * shells out to Java, so two overlapping jobs would race each other's files
   * and could leave the last-written SVG belonging to the older source.
   */
  private queueDiagramWork(
    ctx: EditorContext,
    work: () => Promise<void>,
  ): Promise<void> {
    ctx.diagramWork = ctx.diagramWork
      .catch(() => undefined)
      .then(work)
      .catch((error) => {
        logger.logError(error);
      });
    return ctx.diagramWork;
  }

  /**
   * Watches this document's `.plantuml` sidecar so edits made outside the
   * editor - another tab, a script, an AI agent rewriting the file from a
   * terminal - show up in the open editor right away.
   *
   * Without this the editor keeps showing the sources it read when it was
   * opened, and the next save writes those stale sources straight back over
   * the external edit.
   *
   * The sidecar sits next to the markdown file, which is not guaranteed to be
   * inside an open workspace folder (a wiki opened below its repo root, a repo
   * opened as a subfolder), so the watcher is anchored on the file's own
   * directory rather than on a workspace-relative glob.
   */
  private watchSidecar(ctx: EditorContext): vscode.Disposable | undefined {
    const layout = ctx.diagramLayout;
    if (!ctx.plantumlExternal || !layout) {
      return undefined;
    }

    let watcher: vscode.FileSystemWatcher;
    try {
      // Matched on "*.plantuml" rather than on the sidecar's own file name:
      // a document called e.g. "notes[1].md" would turn into a glob pattern
      // that matches the wrong files (or nothing). The events are filtered by
      // path below instead.
      watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(
          vscode.Uri.file(path.dirname(layout.sidecarPath)),
          "*.plantuml",
        ),
      );
    } catch (error) {
      // Not being able to watch the sidecar only costs live refresh; the
      // editor itself keeps working, so log and carry on.
      logger.logError(error);
      return undefined;
    }

    let timer: NodeJS.Timeout | undefined;
    const schedule = (uri: vscode.Uri) => {
      if (!this.isSamePath(uri.fsPath, layout.sidecarPath)) {
        return;
      }
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = undefined;
        this.reloadSidecar(ctx);
      }, SIDECAR_RELOAD_DEBOUNCE_MS);
    };

    const subscriptions = [
      watcher.onDidChange(schedule),
      watcher.onDidCreate(schedule),
      watcher.onDidDelete(schedule),
    ];

    return new vscode.Disposable(() => {
      if (timer) {
        clearTimeout(timer);
      }
      subscriptions.forEach((subscription) => subscription.dispose());
      watcher.dispose();
    });
  }

  /**
   * Re-reads the sidecar after it changed on disk: refreshes the diagrams the
   * editor holds, pushes the new sources to the webview, and regenerates the
   * SVGs so the images on disk match too.
   *
   * The watcher also fires on the editor's own save; `reconcileSidecar`
   * reports no change in that case and we stop before re-rendering anything.
   */
  private reloadSidecar(ctx: EditorContext): void {
    const layout = ctx.diagramLayout;
    if (!ctx.plantumlExternal || !layout) {
      return;
    }

    this.queueDiagramWork(ctx, async () => {
      // The editor may have been closed while this job sat in the queue.
      if (!this.editors.has(ctx.document.uri.toString())) {
        return;
      }

      const fromDisk = readSidecar(layout);
      const { diagrams, changed } = reconcileSidecar(
        ctx.diagrams,
        fromDisk,
        ctx.document.getText(),
      );
      if (!changed) {
        return;
      }

      logger.logDebug("Reloading externally changed PlantUML sidecar", {
        sidecar: layout.sidecarPath,
        diagrams: diagrams.map((d) => d.name),
      });

      const previous = ctx.lastWritten;
      ctx.diagrams = diagrams;
      // The sidecar on disk is now the authoritative copy of these sources, so
      // treat it as written: a later save only needs to re-render what changes
      // after this point.
      ctx.lastWritten = diagrams;

      // Show the new source immediately - rendering the SVGs shells out to
      // Java and takes noticeably longer.
      this.updateWebview(ctx);

      await renderDiagrams(layout, diagrams, previous, this.plantUmlRenderer);
    });
  }

  /**
   * Roots the webview is allowed to load local files from. Must cover every
   * root `updateWebview` resolves image paths against, or the resulting
   * `vscode-resource` URL is well-formed but unloadable and the image renders
   * as an empty box.
   */
  private getLocalResourceRoots(document: vscode.TextDocument): vscode.Uri[] {
    const roots = [
      this.context.extensionUri,
      vscode.Uri.file(path.dirname(document.uri.fsPath)),
      ...(vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri),
    ];

    try {
      // Throws for a document that is neither in a git repository nor in an
      // open workspace folder; the roots above still cover that case.
      roots.push(vscode.Uri.file(this.getPathRootFolder(document)));
    } catch (error) {
      logger.logDebug("No path root folder for localResourceRoots", error);
    }

    return roots;
  }

  private getWorkspaceFolder(document: vscode.TextDocument) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
      throw new Error("No workspace folder found");
    }
    return workspaceFolder;
  }

  /**
   * Walk up from the document's location looking for a ".git" entry (a directory
   * for a normal repository, or a file for a worktree/submodule) and return the
   * containing folder if found.
   */
  private findGitRepositoryRoot(fsPath: string): string | undefined {
    let currentDir: string;
    try {
      currentDir = fs.statSync(fsPath).isDirectory()
        ? fsPath
        : path.dirname(fsPath);
    } catch {
      currentDir = path.dirname(fsPath);
    }

    let previousDir: string | undefined;
    while (currentDir !== previousDir) {
      if (fs.existsSync(path.join(currentDir, ".git"))) {
        return currentDir;
      }
      previousDir = currentDir;
      currentDir = path.dirname(currentDir);
    }

    return undefined;
  }

  /**
   * Resolve the root that '/'-prefixed (workspace-relative) links and image paths
   * are resolved against. Prefers the containing git repository root, since the
   * opened VS Code workspace folder may be a parent directory of the actual repo
   * (e.g. when opening a folder that contains the repo as a subfolder or wiki
   * checkout). Falls back to the VS Code workspace folder if the document isn't
   * part of a git repository.
   */
  private getPathRootFolder(document: vscode.TextDocument): string {
    const gitRoot = this.findGitRepositoryRoot(document.uri.fsPath);
    if (gitRoot) {
      return gitRoot;
    }
    return this.getWorkspaceFolder(document).uri.fsPath;
  }

  /**
   * Open a local file link, resolving paths relative to the document or workspace root.
   * Paths starting with '/' are treated as workspace-relative.
   * All other paths are treated as relative to the containing document's directory.
   */
  private async openLocalPath(href: string, document: vscode.TextDocument) {
    const rootFolderPath = this.getPathRootFolder(document);
    let absolutePath: string;
    const pathOnly = href.split("#")[0].split("?")[0];

    if (pathOnly.startsWith("/")) {
      // Workspace-relative path (e.g. /docs/page.md), resolved against the git
      // repository root if the document is part of one
      absolutePath = path.join(rootFolderPath, pathOnly.slice(1));
    } else {
      // Document-relative path (e.g. ./other.md or ../sibling/doc.md)
      const documentDir = path.dirname(document.uri.fsPath);
      absolutePath = path.resolve(documentDir, pathOnly);
    }

    logger.logDebug(`Opening local path: ${absolutePath}`);
    return vscode.workspace.openTextDocument(absolutePath).then(
      (doc) => {
        return vscode.commands
          .executeCommand("vscode.open", doc.uri)
          .then(logger.logDebug, logger.logError);
      },
      () => {
        logger.logError(`File not found: ${absolutePath}`);
        vscode.window.showErrorMessage(`File not found: ${absolutePath}`);
      },
    );
  }

  private async openDocument(uri: vscode.Uri, document: vscode.TextDocument) {
    const fileToOpen = uri.path;
    logger.logDebug(`Opening file: ${fileToOpen}`);
    const currentFile = document.uri.fsPath;
    logger.logDebug(`Current file: ${currentFile}`);
    // get the root folder ('/'-prefixed paths are relative to this) of the document
    const rootFolderPath = this.getPathRootFolder(document);
    logger.logDebug(`Root folder: ${rootFolderPath}`);

    const absolutePath = path.join(rootFolderPath, fileToOpen);
    // log to extension output
    logger.logDebug(`Opening file: ${absolutePath}`);
    vscode.workspace.openTextDocument(absolutePath).then(
      (doc) => {
        return vscode.commands
          .executeCommand("vscode.open", doc.uri)
          .then(logger.logDebug, logger.logError);
      },
      () => {
        // check if file path exists
        const fileName = path.basename(absolutePath);
        const wsEdit = new vscode.WorkspaceEdit();
        vscode.window.showInformationMessage(absolutePath.toString());

        wsEdit.createFile(uri, { ignoreIfExists: false });
        vscode.workspace.applyEdit(wsEdit);
        vscode.window.showInformationMessage("created a new file:" + fileName);
      },
    );
  }

  /**
   * Get the static html used for the editor webviews.
   */
  private getHtmlForWebview(
    webview: vscode.Webview,
    documentUri: string,
  ): string {
    const fontSize = vscode.workspace
      .getConfiguration("inkwell-md")
      .get("fontSize", DEFAULT_FONT_SIZE);

    const fontFamily = vscode.workspace
      .getConfiguration("inkwell-md")
      .get("fontFamily", DEFAULT_FONT_FAMILY);

    const preserveEmptyParagraphs = vscode.workspace
      .getConfiguration("inkwell-md")
      .get<boolean>("preserveEmptyParagraphs", false);

    const plantumlExternal = vscode.workspace
      .getConfiguration("inkwell-md")
      .get("plantumlExternalFiles", DEFAULT_PLANTUML_EXTERNAL_FILES);

    const azureDevOpsEnabled = getAzureDevOpsPat() !== "";

    const docUri = vscode.Uri.parse(documentUri);
    const plantumlBaseName = path.basename(
      docUri.fsPath,
      path.extname(docUri.fsPath),
    );

    // Local path to script and css for the webview
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "out", "client.js"),
    );

    const cssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "out", "client.css"),
    );

    // Use a nonce to whitelist which scripts can be run
    const nonce = getNonce();

    return /* html */ `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
       <link rel="stylesheet" href="${cssUri}">
				<!--
				Use a content security policy to only allow loading images from https or from our extension directory,
				and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${
          webview.cspSource
        } 'unsafe-inline'; img-src ${
      webview.cspSource
    } https: data:; script-src 'nonce-${nonce}';">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>inkwell.md</title>
        <style>
          :root {
            --inkwell-md-font-family: ${fontFamily};
          }
          body {
            margin: 0;
            padding: 0;
            font-size: ${fontSize};
          
          }
     
        #app:empty::after,
        #app:not(:has(*))::after {
          content: '';
        }
        #app.loading {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          background-color: var(--vscode-editor-background);
          color: var(--vscode-editor-foreground);
          font-family: var(--vscode-editor-font-family), var(--inkwell-md-font-family), sans-serif;
          font-size: 1rem;
          opacity: 0.5;
        }
        </style>
			</head>
			<body>
        <main id="app" class="loading">Loading\u2026</main>
        <script nonce="${nonce}">
          window.__RME_DOCUMENT_URI__ = ${JSON.stringify(documentUri)};
          window.__RME_PRESERVE_EMPTY_PARAGRAPHS__ = ${JSON.stringify(
            preserveEmptyParagraphs === true,
          )};
          window.__RME_PLANTUML_EXTERNAL__ = ${JSON.stringify(
            plantumlExternal === true,
          )};
          window.__RME_PLANTUML_BASENAME__ = ${JSON.stringify(
            plantumlBaseName,
          )};
          window.__RME_AZURE_DEVOPS__ = ${JSON.stringify(azureDevOpsEnabled)};
        </script>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
  }

  /**
   * The markdown parser/serializer always round-trips content as LF-only, so
   * CRLF files need their line endings restored before being written back —
   * otherwise every line looks changed to source control on the first edit.
   */
  private matchEol(text: string, document: vscode.TextDocument): string {
    if (document.eol !== vscode.EndOfLine.CRLF) {
      return text;
    }
    return text.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  }

  /**
   * Write out the text to a given document.
   *
   * `revision` (when the caller is an updateMarkdown request rather than an
   * internal write) is queued on `ctx.pendingRevisions` so the
   * onDidChangeTextDocument handler can hand it back to the client once this
   * edit's change event fires - or, if the text turns out to already match
   * (no edit will actually be applied, so no change event will fire either),
   * acknowledged immediately here instead.
   */
  private updateTextDocument(
    ctx: EditorContext,
    text: string,
    revision?: number,
  ) {
    // Edits are applied one after another, each against the document as the
    // previous one left it. Computed up front instead, the no-op check and the
    // whole-document range below would be based on a document an earlier,
    // still-in-flight edit is about to change: when that edit adds lines (an
    // Enter), the stale range stops short of the new end and leaves the old
    // tail behind, duplicated after the new text. The client then receives
    // content it never sent and loads it over what the user is typing.
    ctx.documentEdits = ctx.documentEdits
      .catch(() => undefined)
      .then(() => this.applyTextDocument(ctx, text, revision));
    return ctx.documentEdits;
  }

  private async applyTextDocument(
    ctx: EditorContext,
    text: string,
    revision?: number,
  ) {
    const { document } = ctx;
    const sanitized = this.matchEol(stripTrailingBlankLines(text), document);

    // Skip no-op edits to avoid marking the document dirty unnecessarily.
    if (sanitized === document.getText()) {
      if (revision !== undefined) {
        this.updateWebview(ctx, revision);
      }
      return true;
    }

    if (revision !== undefined) {
      ctx.pendingRevisions.push(revision);
    }

    const edit = new vscode.WorkspaceEdit();

    // Just replace the entire document every time
    edit.replace(
      document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      sanitized,
    );

    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied && revision !== undefined) {
      // No change event will fire to dequeue it; drop it so later edits'
      // change events are still matched with their own revisions.
      const index = ctx.pendingRevisions.indexOf(revision);
      if (index !== -1) ctx.pendingRevisions.splice(index, 1);
    }
    return applied;
  }

}
