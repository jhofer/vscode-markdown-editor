import { toggleMark } from "prosemirror-commands";
import markInputRule from "../lib/markInputRule";
import Mark from "./Mark";

export default class Italic extends Mark {
  get name() {
    return "em";
  }

  get schema() {
    return {
      attrs: {
        // The emphasis delimiter the source used: "_" or "*". Preserved so
        // `_em_` isn't rewritten to `*em*` on open. New marks made in the
        // editor default to "*".
        markup: { default: "*" },
      },
      parseDOM: [
        { tag: "i", getAttrs: () => ({ markup: "*" }) },
        { tag: "em", getAttrs: () => ({ markup: "*" }) },
        {
          style: "font-style",
          getAttrs: value => (value === "italic" ? { markup: "*" } : false),
        },
      ],
      toDOM: () => ["em"],
    };
  }

  inputRules({ type }) {
    return [
      markInputRule(/(?:^|[\s])(_([^_]+)_)$/, type),
      markInputRule(/(?:^|[^*])(\*([^*]+)\*)$/, type),
    ];
  }

  keys({ type }) {
    return {
      "Mod-i": toggleMark(type),
      "Mod-I": toggleMark(type),
    };
  }

  get toMarkdown() {
    return {
      open: (_state, mark) => mark.attrs.markup || "*",
      close: (_state, mark) => mark.attrs.markup || "*",
      mixable: true,
      expelEnclosingWhitespace: true,
    };
  }

  parseMarkdown() {
    return {
      mark: "em",
      getAttrs: tok => ({ markup: tok.markup === "_" ? "_" : "*" }),
    };
  }
}
