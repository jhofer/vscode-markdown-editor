import * as React from "react";
import { textblockTypeInputRule } from "prosemirror-inputrules";
import { NodeSelection } from "prosemirror-state";
import styled from "styled-components";
import Node from "./Node";
import plantumlRule from "../rules/plantuml";

const DEFAULT_DIAGRAM = `Alice -> Bob: Authentication Request
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

  return /^'\s*themedstyle\b/i.test(firstNonEmptyLine || "");
}

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

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newSource = e.target.value;
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

      const pos = getPos();
      const $pos = view.state.doc.resolve(pos);
      const transaction = view.state.tr.setSelection(new NodeSelection($pos));
      view.dispatch(transaction);
    },
    [getPos, view]
  );

  if (isSelected && isEditable) {
    return (
      <div onMouseDown={handleSelect}>
        <EditorContainer>
          <SourcePane>
            <PaneLabel>PlantUML</PaneLabel>
            <Textarea
              autoFocus={isSelected}
              value={previewSource}
              onChange={handleChange}
              spellCheck={false}
              placeholder="Enter PlantUML diagram source…"
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
    <div onMouseDown={handleSelect}>
      <DiagramContainer>
        {renderError || imageLoadError || !imageData ? (
          <FallbackPre>{previewSource}</FallbackPre>
        ) : (
          <DiagramImage
            $whiteBackground={!isThemedStyle}
            src={imageData}
            alt="PlantUML diagram"
            onError={() =>
              setImageLoadError("Rendered image could not be displayed")
            }
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

  component = ({ node, isSelected, isEditable, getPos }: any) => {
    return (
      <PlantUmlView
        node={node}
        isSelected={isSelected}
        isEditable={isEditable}
        getPos={getPos}
        view={this.editor.view}
        renderPlantUml={this.options.onRenderPlantUml}
      />
    );
  };

  toMarkdown(state: any, node: any) {
    state.write("@startuml\n");
    state.text(node.textContent, false);
    state.ensureNewLine();
    state.write("@enduml");
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

  inputRules({ type }: any) {
    return [textblockTypeInputRule(/^@startuml$/, type)];
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

const Textarea = styled.textarea<any>`
  flex: 1;
  resize: none;
  border: none;
  outline: none;
  padding: 10px;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 13px;
  line-height: 1.5;
  color: ${props => props.theme.code};
  background: ${props => props.theme.codeBackground || props.theme.background};
  min-height: 160px;

  &::placeholder {
    color: ${props => props.theme.placeholder};
  }
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
  cursor: default;
  user-select: none;
`;

const DiagramImage = styled.img<DiagramImageProps>`
  max-width: 100%;
  height: auto;
  display: block;
  background: ${props => (props.$whiteBackground ? "#ffffff" : "transparent")};
  padding: ${props => (props.$whiteBackground ? "8px" : "0")};
  border-radius: ${props => (props.$whiteBackground ? "4px" : "0")};
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
