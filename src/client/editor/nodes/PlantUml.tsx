import * as React from "react";
import { textblockTypeInputRule } from "prosemirror-inputrules";
import styled from "styled-components";
import encode from "plantuml-encoder";
import Node from "./Node";
import plantumlRule from "../rules/plantuml";

const PLANTUML_SERVER = "https://www.plantuml.com/plantuml/svg/";

const DEFAULT_DIAGRAM =
  'Alice -> Bob: Authentication Request\nBob --> Alice: Authentication Response';

function encodeDiagram(source: string): string {
  try {
    return PLANTUML_SERVER + encode(source || DEFAULT_DIAGRAM);
  } catch {
    return "";
  }
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
  theme: any;
};

const PlantUmlView: React.FC<Props> = ({
  node,
  isSelected,
  isEditable,
  getPos,
  view,
  theme,
}) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [previewSource, setPreviewSource] = React.useState<string>(
    node.textContent
  );
  const [imgError, setImgError] = React.useState(false);

  // Sync preview source when the node changes externally (e.g. undo/redo).
  React.useEffect(() => {
    setPreviewSource(node.textContent);
    setImgError(false);
  }, [node.textContent]);

  // When entering edit mode, focus the textarea.
  React.useEffect(() => {
    if (isSelected && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isSelected]);

  const diagramUrl = React.useMemo(() => encodeDiagram(previewSource), [
    previewSource,
  ]);

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newSource = e.target.value;

      // Update the live preview.
      setPreviewSource(newSource);
      setImgError(false);

      // Persist the change back into the ProseMirror document.
      const pos = getPos();
      const { tr, doc, schema } = view.state;
      const nodeAtPos = doc.nodeAt(pos);
      if (nodeAtPos) {
        const content = newSource ? schema.text(newSource) : null;
        const newNode = nodeAtPos.type.create(nodeAtPos.attrs, content);
        view.dispatch(tr.replaceWith(pos, pos + nodeAtPos.nodeSize, newNode));
      }
    },
    [getPos, view]
  );

  if (isSelected && isEditable) {
    return (
      <EditorContainer>
        <SourcePane>
          <PaneLabel>PlantUML</PaneLabel>
          <Textarea
            ref={textareaRef}
            defaultValue={node.textContent}
            onChange={handleChange}
            spellCheck={false}
            placeholder="Enter PlantUML diagram source…"
          />
        </SourcePane>
        <PreviewPane>
          <PaneLabel>Preview</PaneLabel>
          {imgError ? (
            <ErrorMessage>
              Preview requires network access to{" "}
              <code>www.plantuml.com</code>
            </ErrorMessage>
          ) : (
            <PreviewImage
              src={diagramUrl}
              alt="PlantUML Preview"
              onError={() => setImgError(true)}
              onLoad={() => setImgError(false)}
            />
          )}
        </PreviewPane>
      </EditorContainer>
    );
  }

  // -------------------------------------------------------------------------
  // View mode – render the diagram as a static image.
  // -------------------------------------------------------------------------
  return (
    <DiagramContainer>
      {imgError ? (
        <FallbackPre>{previewSource}</FallbackPre>
      ) : (
        <DiagramImage
          src={diagramUrl}
          alt="PlantUML diagram"
          onError={() => setImgError(true)}
          onLoad={() => setImgError(false)}
        />
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

  // Delegate rendering to the React component (picked up by ComponentView).
  component = ({ node, isSelected, isEditable, getPos, theme }) => {
    return (
      <PlantUmlView
        node={node}
        isSelected={isSelected}
        isEditable={isEditable}
        getPos={getPos}
        view={this.editor.view}
        theme={theme}
      />
    );
  };

  toMarkdown(state, node) {
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
    };
  }

  inputRules({ type }) {
    return [textblockTypeInputRule(/^@startuml$/, type)];
  }

  commands({ type }) {
    return () => (state, dispatch) => {
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

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------

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

const Textarea = styled.textarea`
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

const PreviewImage = styled.img`
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

const DiagramContainer = styled.div`
  margin: 8px 0;
  cursor: default;
  user-select: none;
`;

const DiagramImage = styled.img`
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
