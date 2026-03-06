// Custom markdown-it plugin to parse [AI]...[/AI] tags
// This allows loading markdown that contains AI completion tags

export default function aiCompletionRule(md) {
  // Inline rule to match [AI]content[/AI]
  function aiCompletionInline(state, silent) {
    const start = state.pos;
    const max = state.posMax;

    // Check for opening [AI]
    if (
      start + 4 > max ||
      state.src.charCodeAt(start) !== 0x5b /* [ */ ||
      state.src.charCodeAt(start + 1) !== 0x41 /* A */ ||
      state.src.charCodeAt(start + 2) !== 0x49 /* I */ ||
      state.src.charCodeAt(start + 3) !== 0x5d /* ] */
    ) {
      return false;
    }

    // Find closing [/AI]
    let pos = start + 4;
    let foundClose = false;
    while (pos < max - 4) {
      if (
        state.src.charCodeAt(pos) === 0x5b /* [ */ &&
        state.src.charCodeAt(pos + 1) === 0x2f /* / */ &&
        state.src.charCodeAt(pos + 2) === 0x41 /* A */ &&
        state.src.charCodeAt(pos + 3) === 0x49 /* I */ &&
        state.src.charCodeAt(pos + 4) === 0x5d /* ] */
      ) {
        foundClose = true;
        break;
      }
      pos++;
    }

    if (!foundClose) {
      return false;
    }

    if (!silent) {
      const content = state.src.slice(start + 4, pos);

      let token = state.push("ai_completion_open", "span", 1);
      token.attrs = [["class", "ai-completion"]];
      token.markup = "[AI]";

      token = state.push("text", "", 0);
      token.content = content;

      token = state.push("ai_completion_close", "span", -1);
      token.markup = "[/AI]";
    }

    state.pos = pos + 5; // Move past [/AI]
    return true;
  }

  md.inline.ruler.after("emphasis", "ai_completion", aiCompletionInline);
}
