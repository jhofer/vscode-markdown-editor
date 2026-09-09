import { search } from "prosemirror-search";
import Extension from "../lib/Extension";

/**
 * Wires the official `prosemirror-search` plugin into the editor and adds a
 * `Mod-f` keybinding that opens the in-document search toolbar.
 *
 * The plugin only stores the current query + renders the match decorations
 * (classes `ProseMirror-search-match` / `ProseMirror-active-search-match`, styled
 * in `styles/editor.ts`). All UI + query state lives in
 * `components/SearchToolbar.tsx`, toggled through the `onOpen` / `onClose`
 * options, mirroring the `BlockMenuTrigger` / `EmojiTrigger` pattern.
 */
export default class Search extends Extension {
  get name() {
    return "search";
  }

  get plugins() {
    return [search()];
  }

  keys() {
    return {
      // Returning true suppresses the browser's native find whenever the editor
      // has DOM focus. When focus is elsewhere the document-level listener in
      // SearchToolbar takes over.
      "Mod-f": () => {
        this.options.onOpen();
        return true;
      },
    };
  }
}
