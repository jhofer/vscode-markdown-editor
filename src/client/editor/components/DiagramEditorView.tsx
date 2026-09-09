import * as React from "react";
import { NodeSelection } from "prosemirror-state";
import styled from "styled-components";
import { basicSetup, EditorView as CMView } from "codemirror";
import { EditorState as CMState } from "@codemirror/state";
import InlinePanZoomViewer from "./InlinePanZoomViewer";

// ---------------------------------------------------------------------------
// Serialized render queue
// ---------------------------------------------------------------------------
//
// Diagram renders are serialized per language: PlantUML because the host-side
// `useBidirectionalEvent` bridge keeps a single in-flight resolve/reject pair
// per message factory, Mermaid because the library mutates global DOM state and
// element ids while rendering. Each `queueKey` gets its own independent chain.

type QueueTask = <T>(task: () => Promise<T>) => Promise<T>;

const renderQueues = new Map<string, QueueTask>();

function getRenderQueue(key: string): QueueTask {
  let queue = renderQueues.get(key);
  if (!queue) {
    let chain: Promise<unknown> = Promise.resolve();
    queue = <T,>(task: () => Promise<T>): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        chain = chain
          .then(async () => {
            resolve(await task());
          })
          .catch(reject);
      });
    renderQueues.set(key, queue);
  }
  return queue;
}

// ---------------------------------------------------------------------------
// Lightweight CodeMirror-based code editor component
// ---------------------------------------------------------------------------

const cmTheme = CMView.theme(
  {
    "&": {
      fontSize: "13px",
      flex: "1",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    },
    ".cm-scroller": {
      fontFamily:
        "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
      overflow: "auto",
      lineHeight: "1.5",
      flex: "1",
    },
    ".cm-content": {
      padding: "8px 10px",
      minHeight: "160px",
      caretColor: "var(--vscode-editor-foreground, #d4d4d4)",
    },
    ".cm-editor": {
      background:
        "var(--vscode-input-background, var(--vscode-editor-background, #1e1e1e))",
      color: "var(--vscode-editor-foreground, #d4d4d4)",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-gutters": {
      background:
        "var(--vscode-editorGutter-background, var(--vscode-editor-background, #1e1e1e))",
      color: "var(--vscode-editorLineNumber-foreground, #858585)",
      borderRight:
        "1px solid var(--vscode-editorIndentGuide-background, rgba(255,255,255,0.1))",
    },
    ".cm-activeLineGutter": {
      background:
        "var(--vscode-editor-lineHighlightBackground, rgba(255,255,255,0.04))",
    },
    ".cm-activeLine": {
      background:
        "var(--vscode-editor-lineHighlightBackground, rgba(255,255,255,0.04))",
    },
    ".cm-selectionBackground, ::selection": {
      background: "var(--vscode-editor-selectionBackground, #264f78) !important",
    },
    ".cm-cursor": {
      borderLeftColor: "var(--vscode-editor-foreground, #d4d4d4)",
    },
  },
  { dark: true }
);

type CodeMirrorEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

const CodeMirrorEditor: React.FC<CodeMirrorEditorProps> = ({
  value,
  onChange,
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const viewRef = React.useRef<CMView | null>(null);
  const onChangeRef = React.useRef(onChange);
  const syncingRef = React.useRef(false);

  // Keep the callback ref current without recreating the editor.
  React.useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Create the CodeMirror instance once on mount.
  React.useEffect(() => {
    if (!containerRef.current) return;

    const view = new CMView({
      state: CMState.create({
        doc: value,
        extensions: [
          basicSetup,
          cmTheme,
          CMView.updateListener.of((update) => {
            if (update.docChanged && !syncingRef.current) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Sync external value changes (e.g., undo/redo) into CodeMirror.
  React.useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      syncingRef.current = true;
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
      syncingRef.current = false;
    }
  }, [value]);

  return (
    // stopPropagation prevents the outer ProseMirror handleSelect from
    // eating mouse events needed for cursor placement inside the editor.
    <div
      style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}
      onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
    >
      <div ref={containerRef} style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Shared diagram node view: split source/preview pane on selection, inline
// pan/zoom preview otherwise. Format-agnostic — `render` returns an image data
// URI (PlantUML: SVG from the host; Mermaid: base64 SVG from the webview).
// ---------------------------------------------------------------------------

export type DiagramRenderResult = {
  imageData: string;
  /**
   * Whether the rendered image needs an opaque light backing to be legible.
   * Defaults to the `whiteBackground` prop when the renderer does not say.
   */
  whiteBackground?: boolean;
};

type Props = {
  node: any;
  isSelected: boolean;
  isEditable: boolean;
  getPos: () => number;
  view: any; // EditorView
  /** Heading shown above the source pane, e.g. "PlantUML" / "Mermaid". */
  label: string;
  render?: (source: string) => Promise<DiagramRenderResult>;
  /** Independent serialization chain; defaults to `label`. */
  queueKey?: string;
  /** Fallback for `DiagramRenderResult.whiteBackground`. */
  whiteBackground?: boolean;
  /** Image alt text; defaults to `${label} diagram`. */
  alt?: string;
  rendererUnavailableMessage?: string;
};

const DiagramEditorView: React.FC<Props> = ({
  node,
  isSelected,
  isEditable,
  getPos,
  view,
  label,
  render,
  queueKey,
  whiteBackground = false,
  alt,
  rendererUnavailableMessage,
}) => {
  const renderIdRef = React.useRef(0);
  const renderTimeoutRef = React.useRef<number | undefined>(undefined);
  const [previewSource, setPreviewSource] = React.useState<string>(
    node.textContent
  );
  const [imageData, setImageData] = React.useState<string>("");
  const [isRendering, setIsRendering] = React.useState(false);
  const [renderError, setRenderError] = React.useState<string | undefined>(
    undefined
  );
  const [imageLoadError, setImageLoadError] = React.useState<string | undefined>(
    undefined
  );
  const [resultWhiteBackground, setResultWhiteBackground] =
    React.useState<boolean>(whiteBackground);

  const diagramAlt = alt ?? `${label} diagram`;
  const queue = React.useMemo(
    () => getRenderQueue(queueKey ?? label),
    [queueKey, label]
  );

  React.useEffect(() => {
    setPreviewSource(node.textContent);
  }, [node.textContent]);

  const requestRender = React.useCallback(
    async (source: string) => {
      if (!render) {
        setRenderError(
          rendererUnavailableMessage ?? `${label} renderer is not available`
        );
        setImageData("");
        return;
      }

      const currentRenderId = ++renderIdRef.current;
      setIsRendering(true);

      try {
        const result = await queue(() => render(source));

        if (currentRenderId !== renderIdRef.current) {
          return;
        }

        const payload = result?.imageData || "";
        if (!payload) {
          setImageData("");
          setRenderError(`${label} returned no image data`);
          return;
        }

        if (!payload.startsWith("data:image/")) {
          setImageData("");
          setRenderError(`${label} returned an unexpected image payload`);
          return;
        }

        setImageLoadError(undefined);
        setResultWhiteBackground(result?.whiteBackground ?? whiteBackground);
        setImageData(payload);
        setRenderError(undefined);
      } catch (error) {
        if (currentRenderId !== renderIdRef.current) {
          return;
        }
        console.error(`Failed to render ${label} diagram:`, error);
        setImageData("");
        setRenderError(String(error));
      } finally {
        if (currentRenderId === renderIdRef.current) {
          setIsRendering(false);
        }
      }
    },
    [render, queue, label, rendererUnavailableMessage, whiteBackground]
  );

  React.useEffect(() => {
    const source = previewSource.trim();
    if (!source) {
      setImageData("");
      setRenderError(undefined);
      setImageLoadError(undefined);
      setIsRendering(false);
      return;
    }

    if (renderTimeoutRef.current !== undefined) {
      window.clearTimeout(renderTimeoutRef.current);
    }

    renderTimeoutRef.current = window.setTimeout(() => {
      void requestRender(source);
    }, 250);

    return () => {
      if (renderTimeoutRef.current !== undefined) {
        window.clearTimeout(renderTimeoutRef.current);
      }
    };
  }, [previewSource, requestRender]);

  const handleCodeMirrorChange = React.useCallback(
    (newSource: string) => {
      if (!view) {
        return;
      }

      setPreviewSource(newSource);

      const pos = getPos();
      const { tr, doc, schema } = view.state;
      const nodeAtPos = doc.nodeAt(pos);
      if (nodeAtPos) {
        const content = newSource ? schema.text(newSource) : null;
        const newNode = nodeAtPos.type.create(nodeAtPos.attrs, content);
        const transaction = tr.replaceWith(
          pos,
          pos + nodeAtPos.nodeSize,
          newNode
        );

        // Keep the diagram node selected while editing so multiline input
        // (for example pressing Enter) does not collapse back to view mode.
        transaction.setSelection(NodeSelection.create(transaction.doc, pos));
        view.dispatch(transaction);
      }
    },
    [getPos, view]
  );

  const handleSelect = React.useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();

      if (!view) {
        return;
      }

      const pos = getPos();
      const $pos = view.state.doc.resolve(pos);
      const transaction = view.state.tr.setSelection(new NodeSelection($pos));
      view.dispatch(transaction);
    },
    [getPos, view]
  );

  const enterEditMode = React.useCallback(() => {
    if (!view || !isEditable) {
      return;
    }
    const pos = getPos();
    const $pos = view.state.doc.resolve(pos);
    const transaction = view.state.tr.setSelection(new NodeSelection($pos));
    view.dispatch(transaction);
  }, [getPos, isEditable, view]);

  if (isSelected && isEditable) {
    return (
      <div onMouseDown={handleSelect}>
        <EditorContainer>
          <SourcePane>
            <PaneLabel>{label}</PaneLabel>
            <CodeMirrorEditor
              value={previewSource}
              onChange={handleCodeMirrorChange}
            />
          </SourcePane>
          <PreviewPane>
            <PaneLabel>Preview</PaneLabel>
            {renderError ? (
              <ErrorMessage>
                <strong>Render failed.</strong>
                <br />
                {renderError}
              </ErrorMessage>
            ) : isRendering ? (
              <LoadingMessage>Rendering diagram...</LoadingMessage>
            ) : imageData ? (
              <PreviewImage
                $whiteBackground={resultWhiteBackground}
                src={imageData}
                alt={`${label} Preview`}
                onError={() =>
                  setImageLoadError("Rendered image could not be displayed")
                }
              />
            ) : (
              <LoadingMessage>Enter {label} source to preview.</LoadingMessage>
            )}
            {imageLoadError ? <ErrorMessage>{imageLoadError}</ErrorMessage> : null}
          </PreviewPane>
        </EditorContainer>
      </div>
    );
  }

  const fallbackError = renderError || imageLoadError;

  return (
    <div>
      <DiagramContainer>
        {fallbackError || !imageData ? (
          <FallbackContainer
            $clickable={isEditable}
            onMouseDown={
              isEditable
                ? (event: React.MouseEvent) => {
                    event.preventDefault();
                    enterEditMode();
                  }
                : undefined
            }
            title={isEditable ? `Click to edit ${label} source` : undefined}
          >
            {fallbackError ? (
              <FallbackError>{fallbackError}</FallbackError>
            ) : null}
            <FallbackPre>{previewSource}</FallbackPre>
          </FallbackContainer>
        ) : (
          <InlinePanZoomViewer
            src={imageData}
            alt={diagramAlt}
            maxWidth={920}
            maxHeight={520}
            whiteBackground={resultWhiteBackground}
            onEdit={isEditable ? enterEditMode : undefined}
          />
        )}
      </DiagramContainer>
    </div>
  );
};

export default DiagramEditorView;

const EditorContainer = styled.div`
  display: flex;
  border: 1px solid ${props => props.theme.divider};
  border-radius: 4px;
  overflow: hidden;
  margin: 8px 0;
  min-height: 200px;
`;

const SourcePane = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid ${props => props.theme.divider};
  min-width: 0;
`;

const PreviewPane = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 8px;
  overflow: auto;
  min-width: 0;
`;

const PaneLabel = styled.div`
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${props => props.theme.textSecondary};
  padding: 6px 10px 4px;
  border-bottom: 1px solid ${props => props.theme.divider};
  background: ${props => props.theme.codeBackground || props.theme.background};
`;

type DiagramImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  $whiteBackground?: boolean;
};

const PreviewImage = styled.img<DiagramImageProps>`
  max-width: 100%;
  height: auto;
  display: block;
  background: ${props => (props.$whiteBackground ? "#ffffff" : "transparent")};
  padding: ${props => (props.$whiteBackground ? "8px" : "0")};
  border-radius: ${props => (props.$whiteBackground ? "4px" : "0")};
`;

const ErrorMessage = styled.p`
  color: ${props => props.theme.textSecondary};
  font-size: 13px;
  text-align: center;
  padding: 16px;
`;

const LoadingMessage = styled.p`
  color: ${props => props.theme.textSecondary};
  font-size: 13px;
  text-align: center;
  padding: 16px;
`;

const DiagramContainer = styled.div`
  margin: 8px 0;
`;

const FallbackContainer = styled.div<{ $clickable?: boolean }>`
  cursor: ${props => (props.$clickable ? "pointer" : "default")};
`;

const FallbackError = styled.div`
  font-size: 12px;
  color: ${props => props.theme.textSecondary};
  background: ${props => props.theme.codeBackground || props.theme.background};
  border-left: 3px solid ${props => props.theme.divider};
  padding: 6px 10px;
  border-radius: 4px 4px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
`;

const FallbackPre = styled.pre`
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 13px;
  background: ${props => props.theme.codeBackground || props.theme.background};
  padding: 10px;
  border-radius: 4px;
  overflow: auto;
  color: ${props => props.theme.code};
`;
