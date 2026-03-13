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

      const currentRenderId = ++renderIdRef.current;
      setIsRendering(true);

      try {
        const result = await queuePlantUmlRender(() => renderPlantUml(source));

        if (currentRenderId !== renderIdRef.current) {
          return;
        }

        setImageData(result.imageData);
        setRenderError(undefined);
      } catch (error) {
        if (currentRenderId !== renderIdRef.current) {
          return;
        }

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
      <EditorContainer onMouseDown={handleSelect}>
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
            <PreviewImage src={imageData} alt="PlantUML Preview" />
          ) : (
            <LoadingMessage>Enter PlantUML source to preview.</LoadingMessage>
          )}
        </PreviewPane>
      </EditorContainer>
    );
  }

  return (
    <DiagramContainer onMouseDown={handleSelect}>
      {renderError || !imageData ? (
        <FallbackPre>{previewSource}</FallbackPre>
      ) : (
        <DiagramImage src={imageData} alt="PlantUML diagram" />
      )}
    </DiagramContainer>
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

const PreviewImage = styled.img<any>`
  max-width: 100%;
  height: auto;
  display: block;
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

const DiagramImage = styled.img<any>`
  max-width: 100%;
  height: auto;
  display: block;
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
