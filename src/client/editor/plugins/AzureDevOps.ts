import { Node as ProsemirrorNode } from "prosemirror-model";
import { EditorState, Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import Extension from "../lib/Extension";
import { AzureDevOpsStore } from "../lib/azureDevOpsStore";
import { followLinkHint } from "../marks/Link";
import {
  AzureDevOpsReference,
  UserInfo,
  WorkItemInfo,
  findAzureDevOpsReferences,
} from "../../../common/azureDevOps";

const pluginKey = new PluginKey<PluginState>("azureDevOps");

type PluginState = {
  references: AzureDevOpsReference[];
  decorations: DecorationSet;
};

/** Every work item / user reference in the document, at document positions. */
export function collectReferences(doc: ProsemirrorNode): AzureDevOpsReference[] {
  const references: AzureDevOpsReference[] = [];
  doc.descendants((node, pos) => {
    if (node.type.spec.code || node.type.name === "frontmatter") {
      return false;
    }
    if (!node.isText || !node.text) {
      return true;
    }
    if (
      node.marks.some(
        (mark) => mark.type.name === "code_inline" || mark.type.name === "link"
      )
    ) {
      return false;
    }
    for (const reference of findAzureDevOpsReferences(node.text)) {
      references.push({
        ...reference,
        from: pos + reference.from,
        to: pos + reference.to,
      });
    }
    return false;
  });
  return references;
}

function renderWorkItem(info: WorkItemInfo): HTMLElement {
  const link = document.createElement("a");
  link.className = "ado-work-item";
  link.href = info.url;
  link.contentEditable = "false";
  link.title = `${info.type} ${info.id}: ${info.title} (${info.state}) – ${followLinkHint} to open`;
  if (info.typeColor) {
    link.style.setProperty("--ado-type-color", `#${info.typeColor}`);
  }

  const id = document.createElement("span");
  id.className = "ado-work-item-id";
  id.textContent = `#${info.id}`;

  const title = document.createElement("span");
  title.className = "ado-work-item-title";
  title.textContent = info.title;

  const state = document.createElement("span");
  state.className = "ado-work-item-state";
  if (info.stateColor) {
    state.style.setProperty("--ado-state-color", `#${info.stateColor}`);
  }
  state.textContent = info.state;

  link.append(id, " ", title, " ", state);
  return link;
}

function renderUser(info: UserInfo): HTMLElement {
  const mention = document.createElement("span");
  mention.className = "ado-mention";
  mention.contentEditable = "false";
  mention.textContent = `@${info.displayName}`;
  return mention;
}

function buildDecorations(
  state: EditorState,
  references: AzureDevOpsReference[],
  store: AzureDevOpsStore
): DecorationSet {
  const { from: selectionFrom, to: selectionTo } = state.selection;
  const decorations: Decoration[] = [];

  for (const reference of references) {
    const info =
      reference.kind === "workItem"
        ? store.workItems.get(reference.id)
        : store.users.get(reference.id);
    if (info === null) {
      // Looked up, but unknown (or not accessible): leave the text alone.
      continue;
    }
    // Show the raw markdown while the cursor is on it, so it stays editable.
    const editing = selectionFrom <= reference.to && selectionTo >= reference.from;
    if (info === undefined || editing) {
      decorations.push(
        Decoration.inline(reference.from, reference.to, {
          class: "ado-reference",
        })
      );
      continue;
    }

    decorations.push(
      Decoration.inline(reference.from, reference.to, {
        class: "ado-hidden",
      }),
      Decoration.widget(
        reference.from,
        () =>
          reference.kind === "workItem"
            ? renderWorkItem(info as WorkItemInfo)
            : renderUser(info as UserInfo),
        {
          side: -1,
          ignoreSelection: true,
          key:
            reference.kind === "workItem"
              ? `ado-wi-${JSON.stringify(info)}`
              : `ado-user-${JSON.stringify(info)}`,
        }
      )
    );
  }

  return DecorationSet.create(state.doc, decorations);
}

/**
 * Renders Azure DevOps wiki references the way the Azure DevOps wiki does:
 * `#123` as the work item (type colour, title and state, Ctrl/Cmd+click to
 * open) and `@<guid>` as `@Display Name`. The markdown itself is untouched;
 * moving the cursor onto a reference reveals its source for editing.
 *
 * Only registered when an Azure DevOps personal access token is configured.
 */
export default class AzureDevOps extends Extension {
  get name() {
    return "azure_devops";
  }

  get plugins() {
    const store: AzureDevOpsStore | undefined = this.options.store;
    if (!store) {
      return [];
    }

    const requestMissing = (references: AzureDevOpsReference[]) => {
      const workItemIds: number[] = [];
      const userIds: string[] = [];
      for (const reference of references) {
        if (reference.kind === "workItem") {
          workItemIds.push(reference.id);
        } else {
          userIds.push(reference.id);
        }
      }
      store.ensure(workItemIds, userIds);
    };

    return [
      new Plugin<PluginState>({
        key: pluginKey,
        state: {
          init: (_config, state) => {
            const references = collectReferences(state.doc);
            return {
              references,
              decorations: buildDecorations(state, references, store),
            };
          },
          apply: (tr, value, _oldState, newState) => {
            const references = tr.docChanged
              ? collectReferences(newState.doc)
              : value.references;
            if (!tr.docChanged && !tr.selectionSet && !tr.getMeta(pluginKey)) {
              return value;
            }
            return {
              references,
              decorations: buildDecorations(newState, references, store),
            };
          },
        },
        props: {
          decorations: (state) => pluginKey.getState(state)?.decorations,
        },
        view: (view) => {
          requestMissing(pluginKey.getState(view.state)?.references ?? []);
          const unsubscribe = store.subscribe(() => {
            if (!view.isDestroyed) {
              view.dispatch(view.state.tr.setMeta(pluginKey, true));
            }
          });
          return {
            update: (view, prevState) => {
              if (view.state.doc !== prevState.doc) {
                requestMissing(pluginKey.getState(view.state)?.references ?? []);
              }
            },
            destroy: unsubscribe,
          };
        },
      }),
    ];
  }
}
