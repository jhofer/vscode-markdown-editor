import * as React from "react";
import Node from "./Node";
import mermaidRule from "../rules/mermaid";
import DiagramEditorView, {
  DiagramRenderResult,
} from "../components/DiagramEditorView";

const DEFAULT_DIAGRAM = `flowchart TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Done]
  B -->|No| A`;

type Props = {
  node: any;
  isSelected: boolean;
  isEditable: boolean;
  getPos: () => number;
  view: any; // EditorView
  renderMermaid?: (source: string) => Promise<DiagramRenderResult>;
};

const MermaidView: React.FC<Props> = ({
  node,
  isSelected,
  isEditable,
  getPos,
  view,
  renderMermaid,
}) => {
  return (
    <DiagramEditorView
      node={node}
      isSelected={isSelected}
      isEditable={isEditable}
      getPos={getPos}
      view={view}
      label="Mermaid"
      queueKey="mermaid"
      render={renderMermaid}
      rendererUnavailableMessage="Mermaid renderer is not available"
    />
  );
};

// ---------------------------------------------------------------------------
// ProseMirror node
// ---------------------------------------------------------------------------

export default class Mermaid extends Node {
  get name() {
    return "mermaid";
  }

  get rulePlugins() {
    return [mermaidRule];
  }

  get schema() {
    return {
      content: "text*",
      marks: "",
      group: "block",
      code: true,
      defining: true,
      draggable: false,
      selectable: true,
      parseDOM: [
        {
          tag: "div.mermaid-block",
          preserveWhitespace: "full",
          contentElement: "pre.mermaid-source",
        },
      ],
      toDOM: () => {
        return [
          "div",
          { class: "mermaid-block" },
          ["pre", { class: "mermaid-source" }, 0],
        ];
      },
    };
  }

  component = ({ node, isSelected, isEditable, getPos, view }: any) => {
    return (
      <MermaidView
        node={node}
        isSelected={isSelected}
        isEditable={isEditable}
        getPos={getPos}
        view={view}
        renderMermaid={this.options.onRenderMermaid}
      />
    );
  };

  toMarkdown(state: any, node: any) {
    state.write("```mermaid\n");
    state.text(node.textContent, false);
    state.ensureNewLine();
    state.write("```");
    state.closeBlock(node);
  }

  get markdownToken() {
    return "mermaid";
  }

  parseMarkdown() {
    return {
      block: "mermaid",
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

      const node = type.create(null, type.schema.text(DEFAULT_DIAGRAM));
      const transaction = state.tr.insert(position, node);
      dispatch(transaction);
      return true;
    };
  }
}
