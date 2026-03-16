import {
  Plugin,
  Selection,
  AllSelection,
  TextSelection,
} from "prosemirror-state";
import { GapCursor } from "prosemirror-gapcursor";
import Extension from "../lib/Extension";
import isModKey from "../lib/isModKey";
export default class Keys extends Extension {
  get name() {
    return "keys";
  }

  get plugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            blur: this.options.onBlur,
            focus: this.options.onFocus,
          },
          // we can't use the keys bindings for this as we want to preventDefault
          // on the original keyboard event when handled
          handleKeyDown: (view, event) => {
            // Helper function to check if there are AI completion marks in the document
            const hasAICompletion = () => {
              const { state } = view;
              const { doc } = state;
              const markType = state.schema.marks.ai_completion;
              
              if (!markType) {
                return false;
              }

              let hasAI = false;
              doc.descendants((node) => {
                if (node.marks) {
                  const aiMark = node.marks.find(m => m.type === markType);
                  if (aiMark) {
                    hasAI = true;
                    return false; // Stop iteration
                  }
                }
                return true;
              });
              return hasAI;
            };

            // Handle Ctrl+Space (or Cmd+Space on Mac) to request AI completion
            if (event.key === " " && isModKey(event) && this.options.onRequestCompletion) {
              event.preventDefault();
              this.options.onRequestCompletion();
              return true;
            }

            // Handle Tab to accept completion - ONLY if AI completion exists
            if (event.key === "Tab" && this.options.onAcceptCompletion && hasAICompletion()) {
              event.preventDefault();
              this.options.onAcceptCompletion();
              return true;
            }

            // Handle Escape to dismiss completion (without Mod)
            // Dismiss if either a completion mark exists or a request is still pending.
            const hasPendingCompletion =
              typeof this.options.hasPendingCompletion === "function" &&
              this.options.hasPendingCompletion();

            if (
              event.key === "Escape" &&
              !isModKey(event) &&
              this.options.onDismissCompletion &&
              (hasAICompletion() || hasPendingCompletion)
            ) {
              event.preventDefault();
              this.options.onDismissCompletion();
              return true;
            }

            if (view.state.selection instanceof AllSelection) {
              if (event.key === "ArrowUp") {
                const selection = Selection.atStart(view.state.doc);
                view.dispatch(view.state.tr.setSelection(selection));
                return true;
              }
              if (event.key === "ArrowDown") {
                const selection = Selection.atEnd(view.state.doc);
                view.dispatch(view.state.tr.setSelection(selection));
                return true;
              }
            }

            // edge case where horizontal gap cursor does nothing if Enter key
            // is pressed. Insert a newline and then move the cursor into it.
            if (view.state.selection instanceof GapCursor) {
              if (event.key === "Enter") {
                view.dispatch(
                  view.state.tr.insert(
                    view.state.selection.from,
                    view.state.schema.nodes.paragraph.create({})
                  )
                );
                view.dispatch(
                  view.state.tr.setSelection(
                    TextSelection.near(
                      view.state.doc.resolve(view.state.selection.from),
                      -1
                    )
                  )
                );
                return true;
              }
            }

            // All the following keys require mod to be down
            if (!isModKey(event)) {
              return false;
            }

            if (event.key === "s") {
              event.preventDefault();
              this.options.onSave();
              return true;
            }

            if (event.key === "Enter") {
              event.preventDefault();
              this.options.onSaveAndExit();
              return true;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              this.options.onCancel();
              return true;
            }

            return false;
          },
        },
      }),
    ];
  }
}
