import * as vscode from "vscode";

import { RichMarkdownEditorProvider } from "./host/richMarkdownEditorProvider";
import { initializeOutputChannel as initLogger } from "./host/logger";

let outputChannel: vscode.OutputChannel;
export function activate(context: vscode.ExtensionContext) {
  // set output channel for debugging
  initLogger();

  context.subscriptions.push(RichMarkdownEditorProvider.register(context));
}
