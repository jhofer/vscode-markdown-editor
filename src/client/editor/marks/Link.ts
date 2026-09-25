import { toggleMark } from "prosemirror-commands";
import { EditorState, Plugin, TextSelection } from "prosemirror-state";
import { MarkType } from "prosemirror-model";
import { InputRule } from "prosemirror-inputrules";
import Mark from "./Mark";

const LINK_INPUT_REGEX = /\[([^[]+)]\((\S+)\)$/;

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);

/** Ctrl+Click (Cmd+Click on macOS) follows a link, like in VS Code's own
 *  editors. A plain click only places the cursor so link text can be edited
 *  and selected like any other text. */
export function isFollowLinkClick(event: MouseEvent | KeyboardEvent): boolean {
  return isMac ? event.metaKey : event.ctrlKey;
}

export const followLinkHint = isMac ? "Cmd+Click" : "Ctrl+Click";
export const editLinkHint = isMac ? "Cmd+K" : "Ctrl+K";

function closestAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  if (target instanceof HTMLAnchorElement) return target;
  return target instanceof Element ? target.closest("a") : null;
}

/** Position of the first linked character within the selection, if any. */
function firstLinkPos(state: EditorState, type: MarkType): number | undefined {
  const { from, to } = state.selection;
  let found: number | undefined;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (found !== undefined) return false;
    if (node.isText && type.isInSet(node.marks)) {
      found = Math.max(from, pos);
    }
    return true;
  });
  return found;
}

function isPlainURL(link, parent, index, side) {
  if (link.attrs.title || !/^\w+:/.test(link.attrs.href)) {
    return false;
  }

  const content = parent.child(index + (side < 0 ? -1 : 0));
  if (
    !content.isText ||
    content.text !== link.attrs.href ||
    content.marks[content.marks.length - 1] !== link
  ) {
    return false;
  }

  if (index === (side < 0 ? 1 : parent.childCount - 1)) {
    return true;
  }

  const next = parent.child(index + (side < 0 ? -2 : 1));
  return !link.isInSet(next.marks);
}

export default class Link extends Mark {
  get name() {
    return "link";
  }

  get schema() {
    return {
      attrs: {
        href: {
          default: "",
        },
      },
      inclusive: false,
      parseDOM: [
        {
          tag: "a[href]",
          getAttrs: (dom: HTMLElement) => ({
            href: dom.getAttribute("href"),
          }),
        },
      ],
      toDOM: node => [
        "a",
        {
          ...node.attrs,
          rel: "noopener noreferrer nofollow",
        },
        0,
      ],
    };
  }

  inputRules({ type }) {
    return [
      new InputRule(LINK_INPUT_REGEX, (state, match, start, end) => {
        const [okay, alt, href] = match;
        const { tr } = state;

        if (okay) {
          tr.replaceWith(start, end, this.editor.schema.text(alt)).addMark(
            start,
            start + alt.length,
            type.create({ href })
          );
        }

        return tr;
      }),
    ];
  }

  commands({ type }) {
    return ({ href } = { href: "" }) => toggleMark(type, { href });
  }

  keys({ type }) {
    return {
      "Mod-k": (state, dispatch) => {
        if (state.selection.empty) {
          this.options.onKeyboardShortcut();
          return true;
        }

        // Selection touches an existing link: edit that link rather than
        // toggling it off. The link editor works on the link around the cursor.
        const linkPos = firstLinkPos(state, type);
        if (linkPos !== undefined) {
          if (dispatch) {
            dispatch(
              state.tr.setSelection(
                TextSelection.create(state.doc, linkPos)
              )
            );
          }
          this.options.onKeyboardShortcut();
          return true;
        }

        return toggleMark(type, { href: "" })(state, dispatch);
      },
    };
  }

  get plugins() {
    return [
      new Plugin({
        view: view => {
          const toggle = (event: KeyboardEvent | MouseEvent) =>
            view.dom.classList.toggle(
              "follow-links",
              isFollowLinkClick(event)
            );
          const clear = () => view.dom.classList.remove("follow-links");
          window.addEventListener("keydown", toggle);
          window.addEventListener("keyup", toggle);
          window.addEventListener("mousemove", toggle);
          window.addEventListener("blur", clear);
          return {
            destroy: () => {
              window.removeEventListener("keydown", toggle);
              window.removeEventListener("keyup", toggle);
              window.removeEventListener("mousemove", toggle);
              window.removeEventListener("blur", clear);
            },
          };
        },
        props: {
          handleDOMEvents: {
            mouseover: (_view, event: MouseEvent) => {
              if (
                event.target instanceof HTMLAnchorElement &&
                !event.target.className.includes("ProseMirror-widget")
              ) {
                if (this.options.onHoverLink) {
                  return this.options.onHoverLink(event);
                }
              }
              return false;
            },
            // Ctrl/Cmd+mousedown would otherwise make ProseMirror select the
            // whole paragraph just before the click follows the link.
            mousedown: (view, event: MouseEvent) => {
              if (
                view.editable &&
                isFollowLinkClick(event) &&
                closestAnchor(event.target)
              ) {
                event.preventDefault();
                return true;
              }
              return false;
            },
            click: (view, event: MouseEvent) => {
              const anchor = closestAnchor(event.target);

              if (anchor) {
                // Keep the original markdown href (relative paths, hashes, etc.)
                // instead of the browser-resolved absolute URL.
                const rawHref = anchor.getAttribute("href") || "";
                const href = rawHref || anchor.href;

                // While editing, a plain click (or the click that ends a drag
                // selection) must only move the cursor, never navigate away.
                if (view.editable && !isFollowLinkClick(event)) {
                  event.preventDefault();
                  return false;
                }

                const isHashtag = href.startsWith("#");
                if (isHashtag && this.options.onClickHashtag) {
                  event.stopPropagation();
                  event.preventDefault();
                  this.options.onClickHashtag(href, event);
                  return true;
                }

                if (this.options.onClickLink) {
                  event.stopPropagation();
                  event.preventDefault();
                  this.options.onClickLink(href, event);
                  return true;
                }
              }

              return false;
            },
          },
        },
      }),
    ];
  }

  get toMarkdown() {
    return {
      open(_state, mark, parent, index) {
        return isPlainURL(mark, parent, index, 1) ? "<" : "[";
      },
      close(state, mark, parent, index) {
        return isPlainURL(mark, parent, index, -1)
          ? ">"
          : "](" +
              state.esc(mark.attrs.href) +
              (mark.attrs.title ? " " + state.quote(mark.attrs.title) : "") +
              ")";
      },
    };
  }

  parseMarkdown() {
    return {
      mark: "link",
      getAttrs: tok => ({
        href: tok.attrGet("href"),
        title: tok.attrGet("title") || null,
      }),
    };
  }
}
