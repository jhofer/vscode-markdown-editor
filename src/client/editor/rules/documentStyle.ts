import MarkdownIt from "markdown-it";
import { setDocumentStyle, resetDocumentStyle } from "../lib/documentStyle";

// Tally helper: return the most frequent key, or undefined if the map is empty.
function mode(counts: Record<string, number>): string | undefined {
  let best: string | undefined;
  let bestN = 0;
  for (const [k, n] of Object.entries(counts)) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

/**
 * Infer the document's prevailing list style from its tokens and publish it via
 * lib/documentStyle, so editor-created list nodes adopt it instead of a
 * hard-coded default. Runs on every parse (document load, raw→rich switch).
 */
export default function documentStyleRule(md: MarkdownIt): void {
  md.core.ruler.push("document-style", state => {
    const bullets: Record<string, number> = {};
    const delimiters: Record<string, number> = {};
    let orderedLists = 0;
    let repeatedOneLists = 0;

    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];

      if (tok.type === "bullet_list_open" && tok.markup) {
        bullets[tok.markup] = (bullets[tok.markup] || 0) + 1;
      }

      if (tok.type === "ordered_list_open") {
        orderedLists++;
        const delim = tok.markup === ")" ? ")" : ".";
        delimiters[delim] = (delimiters[delim] || 0) + 1;

        // does this list repeat the same number for every item?
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
          repeatedOneLists++;
        }
      }
    }

    resetDocumentStyle();
    setDocumentStyle({
      bullet: mode(bullets) ?? "-",
      orderedDelimiter: mode(delimiters) ?? ".",
      orderedCounter:
        orderedLists > 0 && repeatedOneLists * 2 >= orderedLists
          ? "one"
          : "ordinal",
    });

    return false;
  });
}
