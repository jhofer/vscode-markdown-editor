import Node from "./Node";

/**
 * A single source newline inside a paragraph ("soft break"). markdown-it emits
 * a `softbreak` token for these; without a node to receive it the parser would
 * throw. Historically `rules/breaks.ts` split every softbreak into a separate
 * paragraph, which turned a soft-wrapped source line into a blank-line-separated
 * block and rewrote the file on open. We now keep the break as an explicit
 * inline node so `serialize(parse(md)) === md` for wrapped prose.
 *
 * Modelled on `nodes/HardBreak.ts`, but with no keys/commands: soft breaks only
 * ever come from parsing. Enter still makes a new paragraph and Shift-Enter
 * still makes a hard break.
 */
export default class SoftBreak extends Node {
  get name() {
    return "soft_break";
  }

  get markdownToken() {
    return "softbreak";
  }

  get schema() {
    return {
      inline: true,
      group: "inline",
      selectable: false,
      parseDOM: [{ tag: "br.soft-break" }],
      toDOM() {
        return ["br", { class: "soft-break" }];
      },
    };
  }

  parseMarkdown() {
    return { node: "soft_break" };
  }

  toMarkdown(state) {
    // A literal newline inside a table cell would break the table markup, so
    // fall back to a space there. `state.inTable` is set by `renderTable`.
    // Use `state.write` (not `state.out +=`) so the newline re-applies the
    // current block delimiter and a soft break inside a list item or
    // blockquote keeps its continuation indent.
    state.write(state.inTable ? " " : "\n");
  }
}
