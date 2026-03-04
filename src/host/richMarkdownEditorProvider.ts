import * as vscode from "vscode";
import * as fs from "fs";
import { DEFAULT_FONT_FAMILY, DEFAULT_FONT_SIZE } from "./constants";

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

// Per-document editor context
interface EditorContext {
  webviewPanel: vscode.WebviewPanel;
  document: vscode.TextDocument;
  messageBroker: HostMessageBroker;
}

export class RichMarkdownEditorProvider
  implements vscode.CustomTextEditorProvider
{
  // Map of document URI to editor context
  private editors: Map<string, EditorContext> = new Map();

  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const provider = new RichMarkdownEditorProvider(context);
    const providerRegistration = vscode.window.registerCustomEditorProvider(
      RichMarkdownEditorProvider.viewType,
      provider,
    );
    return providerRegistration;
  }

  public static readonly viewType = "markdownCustom.richMarkdownEditorJonas";

  constructor(private readonly context: vscode.ExtensionContext) {}

  dataURItoBuffer = (dataURI: string) => {
    const byteString = Buffer.from(dataURI.split(",")[1], "base64");
    return byteString;
  };

  private updateWebview(ctx: EditorContext) {
    const markdown = ctx.document.getText();

    const workspace = this.getWorkspaceFolder(ctx.document);
    const workspaceFolderPath = workspace.uri;

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

      urlLookUp = imageRawUrls.reduce(
        (acc: Record<string, string>, url: string) => {
          if (url.startsWith("http")) {
            acc[url] = url;
            return acc;
          } else {
            // Remove leading slash if present for relative paths
            const cleanUrl = url.startsWith("/") ? url.substring(1) : url;
            const onDiskPath = vscode.Uri.joinPath(workspaceFolderPath, cleanUrl);
            const src = ctx.webviewPanel.webview.asWebviewUri(onDiskPath);

            logger.logDebug("Image URL mapping:", { original: url, onDisk: onDiskPath.toString(), webview: src?.toString() });
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

  private getFiles(path: string): string[] {
    const items = fs.readdirSync(path, { withFileTypes: true });
    const filePaths = [];
    for (const item of items) {
      if (item.isDirectory()) {
        filePaths.push(...this.getFiles(path + "/" + item.name));
      } else {
        filePaths.push(path + "/" + item.name);
      }
    }
    return filePaths;
  }

  private fileSearchResult(text: string, document: vscode.TextDocument) {
    const workspace = this.getWorkspaceFolder(document);
    const workspaceFolderPath = workspace.uri.fsPath;
    const files = this.getFiles(workspaceFolderPath)
      .map((file) => file.replace(workspaceFolderPath, ""))
      .map((file) => file.replace(/\\/g, "/"));

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
    const documentUri = document.uri.toString();
    
    // Setup initial content for the webview
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    
    const messageBroker = new HostMessageBroker(
      webviewPanel,
      documentUri
    );
    
    // Create and store the editor context
    const ctx: EditorContext = {
      webviewPanel,
      document,
      messageBroker,
    };
    this.editors.set(documentUri, ctx);
    
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    // Register message handlers
    messageBroker.registerHandler(
      updateMarkdownMessage.requestType,
      (message: unknown) => {
        const msg = message as IMessage<string>;
        const markdownText = msg.payload;
        this.updateTextDocument(ctx.document, markdownText);
      }
    );

    // Register handler for "ready" message
    messageBroker.registerHandler(
      readyMessage.requestType,
      () => {
        // When the client is ready, send the current markdown content
        this.updateWebview(ctx);
      }
    );

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

          const workspace = this.getWorkspaceFolder(ctx.document);
          const workspaceFolderPath = workspace.uri.fsPath;
          const imagesFolder = "images";

          const imageFolderPath = path.join(workspaceFolderPath, imagesFolder);
          if (!fs.existsSync(imageFolderPath)) {
            fs.mkdirSync(imageFolderPath);
          }
          const filePath = path.join(imageFolderPath, fileName);
          fs.writeFileSync(filePath, buffer);
          const relativePath = path.relative(workspaceFolderPath, filePath);

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
      }
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
        } else {
          vscode.env.openExternal(vscode.Uri.parse(href));
        }
      }
    );

    // Register handler for link search
    messageBroker.registerHandler(
      searchLinkMessage.requestType,
      (message: unknown) => {
        const msg = message as IMessage<string>;
        const searchTerm = msg.payload;
        logger.logDebug("searchLink", searchTerm);
        const result = this.fileSearchResult(searchTerm, ctx.document);
        logger.logDebug("searchLink result", result);
        const responseMsg = searchLinkMessage.response(result);
        ctx.messageBroker.sendMessage(responseMsg);
      }
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

  private async openDocument(uri: vscode.Uri, document: vscode.TextDocument) {
    const fileToOpen = uri.path;
    logger.logDebug(`Opening file: ${fileToOpen}`);
    const currentFile = document.uri.fsPath;
    logger.logDebug(`Current file: ${currentFile}`);
    // get workspace folder of document
    const workspaceFolder = this.getWorkspaceFolder(document);

    const workspaceFolderPath = workspaceFolder?.uri.fsPath;
    logger.logDebug(`Workspace folder: ${workspaceFolderPath}`);

    const absolutePath = path.join(workspaceFolderPath, fileToOpen);
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
  private getHtmlForWebview(webview: vscode.Webview): string {
    const fontSize = vscode.workspace
      .getConfiguration("rich-markdown-editor")
      .get("fontSize", DEFAULT_FONT_SIZE);

    const fontFamily = vscode.workspace
      .getConfiguration("rich-markdown-editor")
      .get("fontSize", DEFAULT_FONT_FAMILY);

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
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} https: data:; script-src 'nonce-${nonce}';">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>Rich Markdown Editor</title>
        <style>
          :root {
            --rich-markdown-editor-font-family: ${fontFamily};
          }
          body {
            margin: 0;
            padding: 0;
            font-size: ${fontSize};
          
          }
         /*  #app {
            min-height: 100vh;
          
          } */
        </style>
			</head>
			<body>
        <main id="app">Loading...</main>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
  }

  /**
   * Write out the text to a given document.
   */
  private updateTextDocument(document: vscode.TextDocument, text: string) {
    const edit = new vscode.WorkspaceEdit();

    // Just replace the entire document every time
    edit.replace(
      document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      text,
    );

    return vscode.workspace.applyEdit(edit);
  }
}
