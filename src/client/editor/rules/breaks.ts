
import MarkdownIt from "markdown-it";
// markdown-it v14 ships lib/token as an ESM-only module, so only import the
// Token type here (erased at compile time); the value is taken from
// state.Token inside the rule below.
import type { Token } from "markdown-it";

// A standalone backslash on its own line. markdown-it emits this as a bare
// `text` token with content "\\" (a `\` immediately before a newline becomes a
// `hardbreak` instead, so this only fires for the artefact that
// `Paragraph.toMarkdown` writes for an empty paragraph when the
// `preserveEmptyParagraphs` setting is on). Turning it back into a real empty
// paragraph is what makes that setting round-trip.
//
// Soft breaks (single source newlines inside a paragraph) are intentionally NOT
// handled here any more: they are represented by the `soft_break` inline node
// (see nodes/SoftBreak.ts) so a soft-wrapped source line survives the
// parse/serialize round trip unchanged instead of being split into separate
// paragraphs.
function isBackslashBreak(token: Token) {
  return token.type === "text" && token.content === "\\";
}

export default function markdownBreakToParagraphs(md: MarkdownIt) {
  // insert a new rule after the "inline" rules are parsed
  md.core.ruler.after("inline", "breaks", state => {
    const { Token } = state;
    const tokens = state.tokens;

    // work backwards through the tokens and find text that looks like a br
    for (let i = tokens.length - 1; i > 0; i--) {
      const tokenChildren = tokens[i].children || [];
      const matches = tokenChildren.filter(isBackslashBreak);

      if (matches.length) {
        let token;

        const nodes: Token[] = [];

        // Split children into groups separated by the backslash breaks
        const groups: Token[][] = [];
        let currentGroup: Token[] = [];

        for (const child of tokenChildren) {
          if (isBackslashBreak(child)) {
            groups.push(currentGroup);
            currentGroup = [];
          } else {
            currentGroup.push(child);
          }
        }
        groups.push(currentGroup);

        for (const group of groups) {
          token = new Token("paragraph_open", "p", 1);
          nodes.push(token);

          token = new Token("inline", "", 0);
          token.level = 1;
          if (group.length) {
            token.children = group;
            token.content = group.map(t => t.content || "").join("");
          } else {
            const text = new Token("text", "", 0);
            text.content = "";
            token.children = [text];
            token.content = "";
          }
          nodes.push(token);

          token = new Token("paragraph_close", "p", -1);
          nodes.push(token);
        }

        tokens.splice(i - 1, 3, ...nodes);
      }
    }

    return false;
  });
}
