import { Plugin, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Node as ProsemirrorNode } from "prosemirror-model";
import Extension from "../lib/Extension";
import getDataTransferUris, {
  announcesDroppableUris,
} from "../lib/getDataTransferUris";
import { DroppedResource } from "../../../common/droppedResources";

/**
 * Insert one node per dropped file at `pos`, separated by spaces so several
 * files dropped at once don't run together.
 */
function insertResources(
  view: EditorView,
  pos: number,
  resources: DroppedResource[],
): void {
  if (resources.length === 0 || view.isDestroyed) {
    return;
  }

  const { schema } = view.state;
  const nodes: ProsemirrorNode[] = [];

  resources.forEach((resource, index) => {
    if (index > 0) {
      nodes.push(schema.text(" "));
    }

    if (resource.isImage && schema.nodes.image) {
      nodes.push(
        schema.nodes.image.create({
          src: resource.rawsrc,
          alt: resource.label,
        }),
      );
      return;
    }

    const marks = schema.marks.link
      ? [schema.marks.link.create({ href: resource.rawsrc })]
      : undefined;
    nodes.push(schema.text(resource.label, marks));
  });

  // The document may have moved on while the host resolved the paths, so the
  // drop position is only a hint by now. Clamping keeps it resolvable; the
  // nearest text position then takes care of a drop that landed on a block
  // boundary, where inline content has nowhere to go.
  const clamped = Math.min(Math.max(pos, 0), view.state.doc.content.size);
  const insertAt = TextSelection.near(view.state.doc.resolve(clamped)).from;
  const tr = view.state.tr.insert(insertAt, nodes);
  const end = insertAt + nodes.reduce((size, node) => size + node.nodeSize, 0);
  tr.setSelection(TextSelection.near(tr.doc.resolve(end)));
  view.dispatch(tr);
  view.focus();
}

/**
 * Dropping a file from VS Code (the explorer, an editor tab) onto the editor
 * links it instead of copying it: images become `![name](./relative/path)`,
 * everything else a plain link to the same relative path. Dropping a file from
 * outside VS Code still goes through the image upload path in `nodes/Image`,
 * which has actual bytes to write somewhere.
 */
export default class FileDrop extends Extension {
  get name() {
    return "file-drop";
  }

  get plugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            // A drop only fires where dragover accepted it. The editor is
            // contenteditable, so the browser already accepts most drags; a
            // drag out of the VS Code explorer is not one of them.
            dragover: (_view, event: DragEvent): boolean => {
              if (
                !this.options.onDropResources ||
                !announcesDroppableUris(event.dataTransfer)
              ) {
                return false;
              }

              event.preventDefault();
              if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "copy";
              }

              // Accepting the drop is all this does — the event still belongs
              // to whoever else wants it.
              return false;
            },
            drop: (view, event: DragEvent): boolean => {
              const onDropResources = this.options.onDropResources;
              if (!onDropResources) {
                return false;
              }

              if (view.props.editable && !view.props.editable(view.state)) {
                return false;
              }

              // Files carrying their own bytes (dragged in from the OS) are
              // the image-upload plugin's business, not ours.
              if (event.dataTransfer?.files?.length) {
                return false;
              }

              const uris = getDataTransferUris(event.dataTransfer);
              if (uris.length === 0) {
                return false;
              }

              event.preventDefault();

              const coords = view.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              });
              const pos = coords ? coords.pos : view.state.selection.from;

              Promise.resolve(onDropResources(uris))
                .then((resources: DroppedResource[]) => {
                  insertResources(view, pos, resources || []);
                })
                .catch((error) => {
                  console.error("Failed to resolve dropped files", error);
                });

              return true;
            },
          },
        },
      }),
    ];
  }
}
