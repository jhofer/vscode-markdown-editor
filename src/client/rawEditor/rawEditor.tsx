import React, { useEffect, useRef } from "react";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { basicSetup } from "codemirror";

interface CodeMirrorEditorProps {
  value: string;
  onChange: (value: string) => void;
}

const vsCodeEditorTheme = EditorView.theme({
  "&": {
    fontFamily: "var(--vscode-editor-font-family)",
    fontSize: "var(--vscode-editor-font-size)",
    color: "var(--vscode-editor-foreground)",
    backgroundColor: "var(--vscode-editor-background)",
    height: "100%",
  },
  ".cm-content": {
    caretColor: "var(--vscode-editorCursor-foreground)",
    fontFamily: "var(--vscode-editor-font-family)",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--vscode-editorCursor-foreground)",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--vscode-editor-selectionBackground)",
  },
  ".cm-panels": {
    backgroundColor: "var(--vscode-editorWidget-background)",
    color: "var(--vscode-editorWidget-foreground)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--vscode-editorGutter-background, var(--vscode-editor-background))",
    color: "var(--vscode-editorLineNumber-foreground)",
    borderRight: "1px solid var(--vscode-editorGroup-border, transparent)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--vscode-editor-lineHighlightBackground, transparent)",
  },
  ".cm-activeLine": {
    backgroundColor: "var(--vscode-editor-lineHighlightBackground, transparent)",
  },
  ".cm-searchMatch": {
    backgroundColor: "var(--vscode-editor-findMatchHighlightBackground, #ea5c0055)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "var(--vscode-editor-findMatchBackground, #ea5c00)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--vscode-editorWidget-background)",
    color: "var(--vscode-editorWidget-foreground)",
    border: "1px solid var(--vscode-editorWidget-border)",
  },
});

export function CodeMirrorEditor({ value, onChange }: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Keep onChange in a ref so the updateListener always uses the latest version
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [basicSetup, vsCodeEditorTheme, EditorView.lineWrapping, updateListener],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update editor content when value changes externally (e.g. from extension host).
  // Full replacement is intentional here: these updates come from outside the editor
  // (file changed on disk / switching modes) so preserving undo history is not desired.
  // Echo updates from the user's own edits are filtered in editorHost.tsx via pendingUpdateRef.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value ?? "" },
      });
    }
  }, [value]);

  return <div ref={containerRef} className="codeMirrorRaw" />;
}
