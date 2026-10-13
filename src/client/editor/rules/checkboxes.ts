import MarkdownIt from "markdown-it";
// markdown-it v14 ships lib/token as an ESM-only module; this file only uses
// Token as a type, so import it from the main package (type-only, erased at
// compile time) instead of the ESM-only subpath.
import type { Token } from "markdown-it";

const CHECKBOX_REGEX = /\[(X|\s|_|-)\]\s(.*)?/i;

function matches(token: Token | void) {
  return token && token.content.match(CHECKBOX_REGEX);
}

function isInline(token: Token | void): boolean {
  return !!token && token.type === "inline";
}

function isParagraph(token: Token | void): boolean {
  return !!token && token.type === "paragraph_open";
}

function isListItem(token: Token | void): boolean {
  return (
    !!token &&
    (token.type === "list_item_open" || token.type === "checkbox_item_open") &&
    // only bullet list items can become checkboxes; ordered items carry "."
    // or ")" as their markup
    ["-", "*", "+"].includes(token.markup)
  );
}

function looksLikeChecklist(tokens: Token[], index: number) {
  return (
    isInline(tokens[index]) &&
    isListItem(tokens[index - 2]) &&
    isParagraph(tokens[index - 1]) &&
    matches(tokens[index])
  );
}

type TokenConstructor = new (
  type: string,
  tag: string,
  nesting: -1 | 0 | 1
) => Token;

function isItemClose(token: Token): boolean {
  return (
    token.type === "list_item_close" || token.type === "checkbox_item_close"
  );
}

/**
 * markdown-it treats `- [ ] a` and `- b` as items of the same bullet list, but
 * the schema keeps checkbox items (checkbox_list) and plain items
 * (bullet_list) in separate list nodes. Split every bullet list into runs of
 * consecutive items of the same kind and wrap each run in the matching list
 * type – otherwise the mismatched items are dropped when building the document.
 */
function splitMixedLists(
  tokens: Token[],
  TokenCtor: TokenConstructor
): Token[] {
  const result: Token[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i];
    if (open.type !== "bullet_list_open") {
      result.push(open);
      continue;
    }

    let close = i + 1;
    while (
      tokens[close].type !== "bullet_list_close" ||
      tokens[close].level !== open.level
    ) {
      close++;
    }

    // collect the direct children of the list (items, possibly with nested
    // lists inside them, which are split recursively)
    const items: { checkbox: boolean; tokens: Token[] }[] = [];
    for (let j = i + 1; j < close; ) {
      const itemOpen = tokens[j];
      let itemClose = j + 1;
      while (
        !isItemClose(tokens[itemClose]) ||
        tokens[itemClose].level !== itemOpen.level
      ) {
        itemClose++;
      }
      items.push({
        checkbox: itemOpen.type === "checkbox_item_open",
        tokens: [
          itemOpen,
          ...splitMixedLists(tokens.slice(j + 1, itemClose), TokenCtor),
          tokens[itemClose],
        ],
      });
      j = itemClose + 1;
    }

    let start = 0;
    while (start < items.length) {
      let end = start;
      while (
        end < items.length &&
        items[end].checkbox === items[start].checkbox
      ) {
        end++;
      }
      const kind = items[start].checkbox ? "checkbox_list" : "bullet_list";
      const runOpen = start === 0 ? open : new TokenCtor("", "ul", 1);
      const runClose =
        end === items.length ? tokens[close] : new TokenCtor("", "ul", -1);
      // a tight source list (`- a` / `- [ ] b` with no blank line between)
      // is remembered on the follow-up run so it serializes back without a
      // blank line between the two lists
      if (start > 0 && items[start].tokens[1]?.hidden) {
        runOpen.attrSet("joined", "true");
      }
      if (runOpen !== open) {
        Object.assign(runOpen, {
          markup: open.markup,
          level: open.level,
          block: true,
          map: items[start].tokens[0].map,
        });
      }
      if (runClose !== tokens[close]) {
        Object.assign(runClose, {
          markup: open.markup,
          level: open.level,
          block: true,
        });
      }
      runOpen.type = `${kind}_open`;
      runClose.type = `${kind}_close`;

      result.push(runOpen);
      for (let k = start; k < end; k++) {
        result.push(...items[k].tokens);
      }
      result.push(runClose);
      start = end;
    }

    i = close;
  }

  return result;
}

export default function markdownItCheckbox(md: MarkdownIt): void {
  function render(tokens, idx) {
    const token = tokens[idx];
    const checked = !!token.attrGet("checked");

    if (token.nesting === 1) {
      // opening tag
      return `<li class="checkbox-list-item"><span class="checkbox ${
        checked ? "checked" : ""
      }">${checked ? "[x]" : "[ ]"}</span>`;
    } else {
      // closing tag
      return "</li>\n";
    }
  }

  md.renderer.rules.checkbox_item_open = render;
  md.renderer.rules.checkbox_item_close = render;

  // insert a new rule after the "inline" rules are parsed
  md.core.ruler.after("inline", "checkboxes", state => {
    const tokens = state.tokens;

    // work backwards through the tokens and find text that looks like a checkbox
    for (let i = tokens.length - 1; i > 0; i--) {
      const matches = looksLikeChecklist(tokens, i);
      if (matches) {
        const value = matches[1];
        const checked = value.toLowerCase() === "x";

        // remove [ ] [x] from list item label – must use the content from the
        // child for escaped characters to be unescaped correctly.
        const tokenChildren = tokens[i].children;
        if (tokenChildren) {
          const contentMatches = tokenChildren[0].content.match(CHECKBOX_REGEX);

          if (contentMatches) {
            const label = contentMatches[2];

            tokens[i].content = label;
            tokenChildren[0].content = label;
          }
        }

        // open list item and ensure checked state is transferred
        tokens[i - 2].type = "checkbox_item_open";

        if (checked === true) {
          tokens[i - 2].attrs = [["checked", "true"]];
        }

        // close the list item – match on level so a nested list inside the
        // item doesn't get its closing token converted instead
        const level = tokens[i - 2].level;
        let j = i;
        while (
          tokens[j].type !== "list_item_close" ||
          tokens[j].level !== level
        ) {
          j++;
        }
        tokens[j].type = "checkbox_item_close";
      }
    }

    state.tokens = splitMixedLists(tokens, state.Token);
    return false;
  });
}
