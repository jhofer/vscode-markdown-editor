import * as React from "react";
import { textblockTypeInputRule } from "prosemirror-inputrules";
import { NodeSelection } from "prosemirror-state";
import styled from "styled-components";
import { basicSetup, EditorView as CMView } from "codemirror";
import { EditorState as CMState } from "@codemirror/state";
import Node from "./Node";
import plantumlRule from "../rules/plantuml";
import InlinePanZoomViewer from "../components/InlinePanZoomViewer";

const DEFAULT_DIAGRAM = `' vscode-style
' vscode-style opt-in allows using the editor's theme colors in the diagram for better integration.
Alice -> Bob: Authentication Request
Bob --> Alice: Authentication Response`;

let plantUmlRenderQueue: Promise<void> = Promise.resolve();

function queuePlantUmlRender<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    plantUmlRenderQueue = plantUmlRenderQueue
      .then(async () => {
        const result = await task();
        resolve(result);
      })
      .catch(reject);
  });
}


function getCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined" || !window.getComputedStyle) {
    return fallback;
  }

  const rootValue = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  if (rootValue) {
    return rootValue;
  }

  const bodyValue = document.body
    ? getComputedStyle(document.body).getPropertyValue(name).trim()
    : "";
  return bodyValue || fallback;
}

function isLowAlphaRgba(value: string): boolean {
  const match = value.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\s*\)/i);
  if (!match) {
    return false;
  }

  const alpha = Number(match[1]);
  return Number.isFinite(alpha) && alpha < 0.45;
}

function toHexColor(value: string): string {
  const match = value.match(
    /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*[0-9.]+\s*)?\)$/i
  );

  if (!match) {
    return value;
  }

  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const toByteHex = (n: number) => clamp(n).toString(16).padStart(2, "0");

  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);

  return `#${toByteHex(r)}${toByteHex(g)}${toByteHex(b)}`;
}

function getCssVarFirst(names: string[], fallback: string): string {
  for (const name of names) {
    const value = getCssVar(name, "");
    if (!value || isLowAlphaRgba(value)) {
      continue;
    }
    return toHexColor(value);
  }

  return toHexColor(fallback);
}

function getPlantUmlSkinparamBlock(): string {
  const background = toHexColor(
    getCssVar("--vscode-editor-background", "#1e1e1e")
  );
  const surface = getCssVarFirst(
    [
      "--vscode-input-background",
      "--vscode-editorWidget-background",
      "--vscode-textCodeBlock-background",
    ],
    "#252526"
  );
  const foreground = getCssVarFirst(
    ["--vscode-input-foreground", "--vscode-editor-foreground"],
    "#d4d4d4"
  );
  const muted = getCssVarFirst(
    ["--vscode-descriptionForeground", "--vscode-editorLineNumber-foreground"],
    foreground
  );
  const accent = getCssVarFirst(
    ["--vscode-input-border", "--vscode-textLink-foreground", "--vscode-focusBorder"],
    foreground
  );
  const border = getCssVarFirst(
    [
      "--vscode-input-border",
      "--vscode-contrastBorder",
      "--vscode-editorWidget-border",
      "--vscode-focusBorder",
    ],
    foreground
  );

  return [
    "skinparam Shadowing false",
    "skinparam RoundCorner 6",
    "skinparam Padding 8",
    `skinparam backgroundColor ${background}`,
    `skinparam defaultFontColor ${foreground}`,
    `skinparam HyperlinkColor ${accent}`,
    `skinparam ArrowColor ${accent}`,
    `skinparam ArrowFontColor ${foreground}`,
    `skinparam BorderColor ${border}`,
    `skinparam SequenceLifeLineBorderColor ${muted}`,
    `skinparam SequenceLifeLineBackgroundColor ${background}`,
    `skinparam ParticipantBackgroundColor ${surface}`,
    `skinparam ParticipantBorderColor ${border}`,
    `skinparam ParticipantFontColor ${foreground}`,
    `skinparam ActorBackgroundColor ${surface}`,
    `skinparam ActorBorderColor ${border}`,
    `skinparam ActorFontColor ${foreground}`,
    `skinparam SequenceBoxBackgroundColor ${surface}`,
    `skinparam SequenceBoxBorderColor ${border}`,
    `skinparam SequenceGroupBackgroundColor ${surface}`,
    `skinparam SequenceGroupBorderColor ${border}`,
    `skinparam SequenceDividerBackgroundColor ${surface}`,
    `skinparam SequenceDividerBorderColor ${border}`,
    `skinparam NoteBorderColor ${border}`,
    `skinparam NoteBackgroundColor ${surface}`,
    `skinparam NoteFontColor ${foreground}`,
    `skinparam ClassBackgroundColor ${surface}`,
    `skinparam ClassBorderColor ${border}`,
    `skinparam ClassFontColor ${foreground}`,
    `skinparam ClassAttributeFontColor ${foreground}`,
    `skinparam ClassStereotypeFontColor ${foreground}`,
    `skinparam EnumBackgroundColor ${surface}`,
    `skinparam EnumBorderColor ${border}`,
    `skinparam EnumFontColor ${foreground}`,
    `skinparam InterfaceBackgroundColor ${surface}`,
    `skinparam InterfaceBorderColor ${border}`,
    `skinparam InterfaceFontColor ${foreground}`,
    `skinparam AbstractClassBackgroundColor ${surface}`,
    `skinparam AbstractClassBorderColor ${border}`,
    `skinparam AbstractClassFontColor ${foreground}`,
    `skinparam ObjectBackgroundColor ${surface}`,
    `skinparam ObjectBorderColor ${border}`,
    `skinparam ObjectFontColor ${foreground}`,
    `skinparam PackageBackgroundColor ${surface}`,
    `skinparam PackageBorderColor ${border}`,
    `skinparam ComponentBackgroundColor ${surface}`,
    `skinparam ComponentBorderColor ${border}`,
    `skinparam DatabaseBackgroundColor ${surface}`,
    `skinparam DatabaseBorderColor ${border}`,
    `skinparam RectangleBackgroundColor ${surface}`,
    `skinparam RectangleBorderColor ${border}`,
    `skinparam CloudBackgroundColor ${surface}`,
    `skinparam CloudBorderColor ${border}`,
    // Deployment diagrams
    `skinparam NodeBackgroundColor ${surface}`,
    `skinparam NodeBorderColor ${border}`,
    `skinparam NodeFontColor ${foreground}`,
    `skinparam StorageBackgroundColor ${surface}`,
    `skinparam StorageBorderColor ${border}`,
    `skinparam StorageFontColor ${foreground}`,
    `skinparam AgentBackgroundColor ${surface}`,
    `skinparam AgentBorderColor ${border}`,
    `skinparam AgentFontColor ${foreground}`,
    `skinparam ArtifactBackgroundColor ${surface}`,
    `skinparam ArtifactBorderColor ${border}`,
    `skinparam ArtifactFontColor ${foreground}`,
    `skinparam FrameBackgroundColor ${surface}`,
    `skinparam FrameBorderColor ${border}`,
    `skinparam FrameFontColor ${foreground}`,
    `skinparam FolderBackgroundColor ${surface}`,
    `skinparam FolderBorderColor ${border}`,
    `skinparam FolderFontColor ${foreground}`,
    `skinparam FileBackgroundColor ${surface}`,
    `skinparam FileBorderColor ${border}`,
    `skinparam FileFontColor ${foreground}`,
    `skinparam CardBackgroundColor ${surface}`,
    `skinparam CardBorderColor ${border}`,
    `skinparam CardFontColor ${foreground}`,
    `skinparam HexagonBackgroundColor ${surface}`,
    `skinparam HexagonBorderColor ${border}`,
    `skinparam HexagonFontColor ${foreground}`,
    // Sequence diagram additional participants
    `skinparam BoundaryBackgroundColor ${surface}`,
    `skinparam BoundaryBorderColor ${border}`,
    `skinparam BoundaryFontColor ${foreground}`,
    `skinparam ControlBackgroundColor ${surface}`,
    `skinparam ControlBorderColor ${border}`,
    `skinparam ControlFontColor ${foreground}`,
    `skinparam EntityBackgroundColor ${surface}`,
    `skinparam EntityBorderColor ${border}`,
    `skinparam EntityFontColor ${foreground}`,
    `skinparam CollectionsBackgroundColor ${surface}`,
    `skinparam CollectionsBorderColor ${border}`,
    `skinparam CollectionsFontColor ${foreground}`,
    `skinparam QueueBackgroundColor ${surface}`,
    `skinparam QueueBorderColor ${border}`,
    `skinparam QueueFontColor ${foreground}`,
    // Use case diagrams
    `skinparam UsecaseBackgroundColor ${surface}`,
    `skinparam UsecaseBorderColor ${border}`,
    `skinparam UsecaseFontColor ${foreground}`,
    // State diagrams
    `skinparam StateBackgroundColor ${surface}`,
    `skinparam StateBorderColor ${border}`,
    `skinparam StateFontColor ${foreground}`,
    `skinparam StateStartColor ${accent}`,
    `skinparam StateEndColor ${accent}`,
    // Activity diagrams
    `skinparam ActivityBackgroundColor ${surface}`,
    `skinparam ActivityBorderColor ${border}`,
    `skinparam ActivityFontColor ${foreground}`,
    `skinparam ActivityStartColor ${accent}`,
    `skinparam ActivityEndColor ${accent}`,
    `skinparam ActivityDiamondBackgroundColor ${surface}`,
    `skinparam ActivityDiamondBorderColor ${border}`,
    `skinparam ActivityDiamondFontColor ${foreground}`,
    `skinparam PartitionBackgroundColor ${surface}`,
    `skinparam PartitionBorderColor ${border}`,
    `skinparam SwimlaneBorderColor ${border}`,
  ].join("\n");
}

function withThemedSkinparams(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) {
    return source;
  }

  const withUmlBlock = /^@startuml\b/i.test(trimmed)
    ? trimmed
    : `@startuml\n${trimmed}\n@enduml`;

  return withUmlBlock.replace(
    /^@startuml\s*/i,
    `@startuml\n${getPlantUmlSkinparamBlock()}\n`
  );
}

function hasThemedStyleOptIn(source: string): boolean {
  const trimmed = source.trim();
  if (!trimmed) {
    return false;
  }

  const firstNonEmptyLine = trimmed
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0);

  return /^'\s*vscode-style\b/i.test(firstNonEmptyLine || "");
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
// React component rendered for each plantuml node
// ---------------------------------------------------------------------------

type Props = {
  node: any;
  isSelected: boolean;
  isEditable: boolean;
  getPos: () => number;
  view: any; // EditorView
  renderPlantUml?: (source: string) => Promise<{ imageData: string }>;
};

const PlantUmlView: React.FC<Props> = ({
  node,
  isSelected,
  isEditable,
  getPos,
  view,
  renderPlantUml,
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
  const [isThemedStyle, setIsThemedStyle] = React.useState(false);

  React.useEffect(() => {
    setPreviewSource(node.textContent);
  }, [node.textContent]);

  const requestRender = React.useCallback(
    async (source: string) => {
      if (!renderPlantUml) {
        setRenderError("PlantUML renderer is not available");
        setImageData("");
        return;
      }

      const applyThemedStyle = hasThemedStyleOptIn(source);
      const themedSource = applyThemedStyle
        ? withThemedSkinparams(source)
        : source;

      const currentRenderId = ++renderIdRef.current;
      setIsRendering(true);

      try {
        let result: { imageData: string } | undefined;

        try {
          result = await queuePlantUmlRender(() => renderPlantUml(themedSource));
        } catch {
          if (themedSource !== source) {
            result = await queuePlantUmlRender(() => renderPlantUml(source));
          } else {
            throw new Error("PlantUML themed render failed");
          }
        }

        if (!result?.imageData && themedSource !== source) {
          result = await queuePlantUmlRender(() => renderPlantUml(source));
        }

        if (currentRenderId !== renderIdRef.current) {
          return;
        }

        const payload = result?.imageData || "";
        if (!payload) {
          setImageData("");
          setRenderError("PlantUML returned no image data");
          return;
        }

        if (!payload.startsWith("data:image/")) {
          setImageData("");
          setRenderError("PlantUML returned an unexpected image payload");
          return;
        }

        setImageLoadError(undefined);
        setIsThemedStyle(applyThemedStyle);
        setImageData(payload);
        setRenderError(undefined);
      } catch (error) {
        if (currentRenderId !== renderIdRef.current) {
          return;
        }
        console.error("Failed to render PlantUML diagram:", error);
        setImageData("");
        setRenderError(String(error));
      } finally {
        if (currentRenderId === renderIdRef.current) {
          setIsRendering(false);
        }
      }
    },
    [renderPlantUml]
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
            <PaneLabel>PlantUML</PaneLabel>
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
                $whiteBackground={!isThemedStyle}
                src={imageData}
                alt="PlantUML Preview"
                onError={() =>
                  setImageLoadError("Rendered image could not be displayed")
                }
              />
            ) : (
              <LoadingMessage>Enter PlantUML source to preview.</LoadingMessage>
            )}
            {imageLoadError ? <ErrorMessage>{imageLoadError}</ErrorMessage> : null}
          </PreviewPane>
        </EditorContainer>
      </div>
    );
  }

  return (
    <div>
      <DiagramContainer>
        {renderError || imageLoadError || !imageData ? (
          <FallbackPre>{previewSource}</FallbackPre>
        ) : (
          <InlinePanZoomViewer
            src={imageData}
            alt="PlantUML diagram"
            maxWidth={920}
            maxHeight={520}
            whiteBackground={!isThemedStyle}
            onEdit={isEditable ? enterEditMode : undefined}
          />
        )}
      </DiagramContainer>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ProseMirror node
// ---------------------------------------------------------------------------

export default class PlantUml extends Node {
  get name() {
    return "plantuml";
  }

  get rulePlugins() {
    return [plantumlRule];
  }

  get schema() {
    return {
      attrs: {},
      content: "text*",
      marks: "",
      group: "block",
      code: true,
      defining: true,
      draggable: false,
      selectable: true,
      parseDOM: [
        {
          tag: "div.plantuml-block",
          preserveWhitespace: "full",
          contentElement: "pre.plantuml-source",
        },
      ],
      toDOM: () => {
        return [
          "div",
          { class: "plantuml-block" },
          ["pre", { class: "plantuml-source" }, 0],
        ];
      },
    };
  }

  component = ({ node, isSelected, isEditable, getPos, view }: any) => {
    return (
      <PlantUmlView
        node={node}
        isSelected={isSelected}
        isEditable={isEditable}
        getPos={getPos}
        view={view}
        renderPlantUml={this.options.onRenderPlantUml}
      />
    );
  };

  toMarkdown(state: any, node: any) {
    state.write("```plantuml\n");
    state.write("@startuml\n");
    state.text(node.textContent, false);
    state.ensureNewLine();
    state.write("@enduml\n");
    state.write("```");
    state.closeBlock(node);
  }

  get markdownToken() {
    return "plantuml";
  }

  parseMarkdown() {
    return {
      block: "plantuml",
      noCloseToken: true,
    };
  }

  inputRules() {
    return [];
  }

  commands({ type }: any) {
    return () => (state: any, dispatch: any) => {
      const { selection } = state;
      const position = selection.$cursor
        ? selection.$cursor.pos
        : selection.$to.pos;
      const node = type.create(
        {},
        type.schema.text(DEFAULT_DIAGRAM)
      );
      const transaction = state.tr.insert(position, node);
      dispatch(transaction);
      return true;
    };
  }
}

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

const FallbackPre = styled.pre`
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 13px;
  background: ${props => props.theme.codeBackground || props.theme.background};
  padding: 10px;
  border-radius: 4px;
  overflow: auto;
  color: ${props => props.theme.code};
`;
