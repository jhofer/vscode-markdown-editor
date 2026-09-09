import { wrappingInputRule } from "prosemirror-inputrules";
import toggleList from "../commands/toggleList";
import Node from "./Node";

// Whether the source list counted up (1. 2. 3.) or repeated one number
// (1. 1. 1.), so the serializer reproduces the same style instead of always
// renumbering.
function detectCounter(tokens, i): "ordinal" | "one" {
  const numbers: number[] = [];
  let depth = 0;
  for (let j = i; j < tokens.length; j++) {
    const t = tokens[j];
    if (t.type === "ordered_list_open" || t.type === "bullet_list_open") {
      depth++;
    } else if (
      t.type === "ordered_list_close" ||
      t.type === "bullet_list_close"
    ) {
      depth--;
      if (depth === 0) break;
    } else if (t.type === "list_item_open" && depth === 1) {
      const n = parseInt(t.info || "", 10);
      if (!Number.isNaN(n)) numbers.push(n);
    }
  }
  if (numbers.length > 1 && numbers.every(n => n === numbers[0])) {
    return "one";
  }
  return "ordinal";
}

export default class OrderedList extends Node {
  get name() {
    return "ordered_list";
  }

  get schema() {
    return {
      attrs: {
        order: {
          default: 1,
        },
        // The marker delimiter: "." or ")". Preserved so `1)` isn't rewritten
        // to `1.` on open.
        delimiter: {
          default: ".",
        },
        // "ordinal" (1. 2. 3.) or "one" (1. 1. 1.) — reproduce the source's
        // numbering style rather than always renumbering.
        counter: {
          default: "ordinal",
        },
      },
      content: "list_item+",
      group: "block",
      parseDOM: [
        {
          tag: "ol",
          getAttrs: (dom: HTMLOListElement) => ({
            order: dom.hasAttribute("start")
              ? parseInt(dom.getAttribute("start") || "1", 10)
              : 1,
          }),
        },
      ],
      toDOM: node =>
        node.attrs.order === 1
          ? ["ol", 0]
          : ["ol", { start: node.attrs.order }, 0],
    };
  }

  commands({ type, schema }) {
    return () => toggleList(type, schema.nodes.list_item);
  }

  keys({ type, schema }) {
    return {
      "Shift-Ctrl-9": toggleList(type, schema.nodes.list_item),
    };
  }

  inputRules({ type }) {
    return [
      wrappingInputRule(
        /^(\d+)\.\s$/,
        type,
        match => ({ order: +match[1] }),
        (match, node) => node.childCount + node.attrs.order === +match[1]
      ),
    ];
  }

  toMarkdown(state, node) {
    const start = node.attrs.order !== undefined ? node.attrs.order : 1;
    const delim = node.attrs.delimiter || ".";
    const one = node.attrs.counter === "one";
    const maxW = `${start + node.childCount - 1}`.length;
    const space = state.repeat(" ", maxW + delim.length + 1);

    state.renderList(node, space, i => {
      const nStr = `${one ? start : start + i}`;
      return (
        state.repeat(" ", Math.max(0, maxW - nStr.length)) + nStr + delim + " "
      );
    });
  }

  parseMarkdown() {
    return {
      block: "ordered_list",
      getAttrs: (tok, tokens, i) => ({
        order: parseInt(tok.attrGet("start") || "1", 10),
        delimiter: tok.markup === ")" ? ")" : ".",
        counter: detectCounter(tokens, i),
      }),
    };
  }
}
