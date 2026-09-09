import * as React from "react";
import Node from "./Node";
import plantumlRule from "../rules/plantuml";
import DiagramEditorView, {
  DiagramRenderResult,
} from "../components/DiagramEditorView";
import { getEditorSettings } from "../lib/editorSettings";
import {
  getCssVar,
  getCssVarFirst,
  toHexColor,
} from "../lib/vscodeThemeColors";

const DEFAULT_DIAGRAM = `' vscode-style
' vscode-style opt-in allows using the editor's theme colors in the diagram for better integration.
Alice -> Bob: Authentication Request
Bob --> Alice: Authentication Response`;

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
// React component rendered for each plantuml node
// ---------------------------------------------------------------------------

type Props = {
  node: any;
  isSelected: boolean;
  isEditable: boolean;
  getPos: () => number;
  view: any; // EditorView
  renderPlantUml?: (
    source: string
  ) => Promise<{ imageData: string; mimeType?: string }>;
};

const PlantUmlView: React.FC<Props> = ({
  node,
  isSelected,
  isEditable,
  getPos,
  view,
  renderPlantUml,
}) => {
  const render = React.useMemo(() => {
    if (!renderPlantUml) {
      return undefined;
    }

    return async (source: string): Promise<DiagramRenderResult> => {
      const applyThemedStyle = hasThemedStyleOptIn(source);
      const themedSource = applyThemedStyle
        ? withThemedSkinparams(source)
        : source;

      let result: { imageData: string } | undefined;

      try {
        result = await renderPlantUml(themedSource);
      } catch {
        if (themedSource !== source) {
          result = await renderPlantUml(source);
        } else {
          throw new Error("PlantUML themed render failed");
        }
      }

      if (!result?.imageData && themedSource !== source) {
        result = await renderPlantUml(source);
      }

      return {
        imageData: result?.imageData || "",
        whiteBackground: !applyThemedStyle,
      };
    };
  }, [renderPlantUml]);

  return (
    <DiagramEditorView
      node={node}
      isSelected={isSelected}
      isEditable={isEditable}
      getPos={getPos}
      view={view}
      label="PlantUML"
      queueKey="plantuml"
      whiteBackground
      render={render}
      rendererUnavailableMessage="PlantUML renderer is not available"
    />
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
      attrs: {
        name: { default: null },
      },
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
          getAttrs: (dom: HTMLElement) => ({
            name: dom.getAttribute("data-name") || null,
          }),
        },
      ],
      toDOM: (node: any) => {
        const attrs: Record<string, string> = {};
        if (node.attrs.name) {
          attrs["data-name"] = node.attrs.name;
        }
        return [
          "div",
          { class: "plantuml-block", ...attrs },
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
    state.write(node.attrs.name ? `@startuml ${node.attrs.name}\n` : "@startuml\n");
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
      getAttrs: (tok: any) => ({ name: tok.meta?.name ?? null }),
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

      const attrs: { name: string | null } = { name: null };
      const { plantumlExternal, plantumlBaseName } = getEditorSettings();
      if (plantumlExternal) {
        // Allocate the name up front so the host doesn't rename this diagram
        // out from under the user on the next save (which would remount the
        // editor and lose the cursor mid-typing).
        let maxIndex = 0;
        state.doc.descendants((n: any) => {
          if (n.type.name === "plantuml" && typeof n.attrs.name === "string") {
            const m = /^(.*)-(\d+)$/.exec(n.attrs.name);
            if (m && m[1] === plantumlBaseName) {
              maxIndex = Math.max(maxIndex, parseInt(m[2], 10));
            }
          }
        });
        attrs.name = `${plantumlBaseName}-${maxIndex + 1}`;
      }

      const node = type.create(
        attrs,
        type.schema.text(DEFAULT_DIAGRAM)
      );
      const transaction = state.tr.insert(position, node);
      dispatch(transaction);
      return true;
    };
  }
}
