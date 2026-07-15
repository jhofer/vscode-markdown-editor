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
import { CopilotProvider } from "./copilotProvider";
import { PlantUmlRenderer } from "./plantUmlRenderer";
import { stripTrailingBlankLines } from "../common/stripTrailingBlankLines";
import {
  Diagram,
  extractDiagrams,
  inlineDiagrams,
  mergeDiagrams,
  nameFences,
} from "../common/plantumlSidecar";
import {
  DiagramDocumentLayout,
  layoutFor,
  normalizeAttachmentsFolder,
  readSidecar,
  writeDiagrams,
} from "./plantUmlExternalFiles";

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
}

export class RichMarkdownEditorProvider
  implements vscode.CustomTextEditorProvider
{
  // Map of document URI to editor context
  private editors: Map<string, EditorContext> = new Map();
  private copilotProvider = new CopilotProvider();
  private plantUmlRenderer: PlantUmlRenderer;

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
  }

  dataURItoBuffer = (dataURI: string) => {
    const byteString = Buffer.from(dataURI.split(",")[1], "base64");
    return byteString;
  };

  private updateWebview(ctx: EditorContext) {
    let markdown = ctx.document.getText();

    if (ctx.plantumlExternal && ctx.diagramLayout) {
      // Assign stable names to any still-unnamed inline fences (migration of
      // documents not yet externalized), then reconstitute this document's
      // own externalized diagrams (per the ownership rules) as fences so the
      // webview always sees inline PlantUML source, never a generated image.
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

      urlLookUp = imageRawUrls.reduce(
        (acc: Record<string, string>, url: string) => {
          if (url.startsWith("http")) {
            acc[url] = url;
            return acc;
          } else {
            let onDiskPath: vscode.Uri;
            if (url.startsWith("/")) {
              // Workspace-relative path (leading '/' means relative to the git repository
              // root, or the workspace root if the document isn't part of a git repository)
              const cleanUrl = url.substring(1);
              onDiskPath = vscode.Uri.joinPath(rootFolderPath, cleanUrl);
            } else {
              // Document-relative path (resolve against the containing file's directory)
              onDiskPath = vscode.Uri.joinPath(documentDir, url);
            }
            const src = ctx.webviewPanel.webview.asWebviewUri(onDiskPath);

            logger.logDebug("Image URL mapping:", {
              original: url,
              onDisk: onDiskPath.toString(),
              webview: src?.toString(),
            });
            acc[url] = src.toString();
            return acc;
          }
        },
        urlLookUp,
      );
    }

    const message = updateMarkdownMessage.response(markdown || "", urlLookUp);
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
      this.updateWebview(ctx);
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
        const msg = message as IMessage<string>;
        let markdownText = msg.payload;
        if (ctx.plantumlExternal && ctx.diagramLayout) {
          const extracted = extractDiagrams(markdownText, ctx.diagramLayout);
          markdownText = extracted.markdown;
          ctx.diagrams = mergeDiagrams(ctx.diagrams, extracted.diagrams, markdownText);
        }
        this.updateTextDocument(ctx.document, markdownText);
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
        writeDiagrams(layout, diagrams, ctx.lastWritten, this.plantUmlRenderer)
          .then(() => {
            ctx.lastWritten = diagrams;
          })
          .catch((error) => {
            logger.logError(error);
          });
      },
    );

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
      viewStateSubscription.dispose();
      // Remove the editor context from the map
      this.editors.delete(documentUri);
    });
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
      .get("preserveEmptyParagraphs", false);

    const plantumlExternal = vscode.workspace
      .getConfiguration("inkwell-md")
      .get("plantumlExternalFiles", DEFAULT_PLANTUML_EXTERNAL_FILES);

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
        </script>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
  }

  /**
   * Write out the text to a given document.
   */
  private updateTextDocument(document: vscode.TextDocument, text: string) {
    const sanitized = stripTrailingBlankLines(text);

    // Skip no-op edits to avoid marking the document dirty unnecessarily.
    if (sanitized === document.getText()) {
      return Promise.resolve(true);
    }

    const edit = new vscode.WorkspaceEdit();

    // Just replace the entire document every time
    edit.replace(
      document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      sanitized,
    );

    return vscode.workspace.applyEdit(edit);
  }
}
