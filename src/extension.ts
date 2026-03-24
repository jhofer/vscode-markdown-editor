import * as vscode from "vscode";

import { RichMarkdownEditorProvider } from "./host/richMarkdownEditorProvider";
import { initializeOutputChannel as initLogger } from "./host/logger";

const MARKDOWN_PATTERN = /\.(md|markdown)$/i;
// Tracks URIs for which a `vscode.openWith` is in flight, so that the
// onDidChangeActiveTextEditor listener does not schedule a duplicate open.
const pendingCustomEditorOpens = new Set<string>();

let outputChannel: vscode.OutputChannel;
export function activate(context: vscode.ExtensionContext) {
  // set output channel for debugging
  initLogger();

  context.subscriptions.push(RichMarkdownEditorProvider.register(context));

  // Auto-open .md files with the custom editor when opened as a standalone
  // text editor (e.g. by double-clicking in the Explorer or from keyboard
  // shortcuts). We intentionally skip diff views so that Source Control diffs
  // use the built-in text diff editor with line-by-line highlighting.
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) {
        return;
      }
      const doc = editor.document;
      if (doc.uri.scheme !== "file" || !MARKDOWN_PATTERN.test(doc.uri.path)) {
        return;
      }

      // Only switch when the active tab is a plain text tab (not a diff tab).
      // TabInputText  → regular text editor  → switch to inkwell
      // TabInputTextDiff → diff editor       → leave as-is so diff works
      const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
      if (activeTab?.input instanceof vscode.TabInputText) {
        const uriStr = doc.uri.toString();
        if (!pendingCustomEditorOpens.has(uriStr)) {
          pendingCustomEditorOpens.add(uriStr);
          vscode.commands
            .executeCommand(
              "vscode.openWith",
              doc.uri,
              RichMarkdownEditorProvider.viewType,
            )
            .then(
              () => {
                pendingCustomEditorOpens.delete(uriStr);
                // After the custom editor opens, close any leftover plain-text
                // tabs for the same URI (searching all tab groups by URI is
                // more robust than holding a stale tab reference).
                const textTabsToClose: vscode.Tab[] = [];
                for (const group of vscode.window.tabGroups.all) {
                  for (const tab of group.tabs) {
                    if (
                      tab.input instanceof vscode.TabInputText &&
                      tab.input.uri.toString() === uriStr
                    ) {
                      textTabsToClose.push(tab);
                    }
                  }
                }
                if (textTabsToClose.length > 0) {
                  vscode.window.tabGroups.close(textTabsToClose);
                }
              },
              () => pendingCustomEditorOpens.delete(uriStr),
            );
        }
      }
    }),
  );
}
