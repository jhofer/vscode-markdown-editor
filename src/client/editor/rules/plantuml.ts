/**
 * Strips @startuml [name] / @enduml wrapper lines from PlantUML source,
 * returning the inner diagram content and the name (if any) carried on the
 * @startuml line — e.g. `@startuml architecture-1`.
 */
function stripUmlDelimiters(content: string): { content: string; name: string | null } {
  const lines = content.split(/\r?\n/);
  let start = 0;
  let end = lines.length;
  let name: string | null = null;

  // Trim trailing empty lines (fence content typically ends with \n)
  while (end > start && lines[end - 1].trim() === "") {
    end--;
  }

  // Strip leading @startuml (with optional backslash escape), capturing a name if present
  if (start < end) {
    const startMatch = /^\\?@startuml\b[ \t]*(\S+)?/i.exec(lines[start].trim());
    if (startMatch) {
      name = startMatch[1] ?? null;
      start++;
    }
  }
  // Strip trailing @enduml (with optional backslash escape)
  if (end > start && /^\\?@enduml\s*$/i.test(lines[end - 1].trim())) {
    end--;
  }

  return { content: lines.slice(start, end).join("\n"), name };
}

/**
 * markdown-it rule to parse PlantUML blocks.
 *
 * Supports two formats:
 * 1. Fenced code blocks with "plantuml" info string (preferred):
 *    ```plantuml
 *    @startuml
 *    ...
 *    @enduml
 *    ```
 *
 * 2. Legacy bare @startuml / @enduml delimiters (backward compat):
 *    @startuml
 *    ...
 *    @enduml
 *
 * Both emit a "plantuml" block token whose .content holds the raw diagram
 * source (without the @startuml/@enduml delimiter lines).
 */
export default function plantumlRule(md): void {
  // --- Format 1: Intercept fenced code blocks with info "plantuml" ---
  // Runs as a core rule after all block parsing. Rewrites fence tokens
  // with info "plantuml" into plantuml tokens so the ProseMirror parser
  // picks them up as PlantUml nodes instead of CodeFence nodes.
  md.core.ruler.after("block", "plantuml_fence", function(state) {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      if (tok.type === "fence" && tok.info.trim().toLowerCase() === "plantuml") {
        const { content, name } = stripUmlDelimiters(tok.content);
        tok.type = "plantuml";
        tok.tag = "div";
        tok.content = content;
        tok.meta = { ...(tok.meta || {}), name };
      }
    }
  });

  // --- Format 2: Legacy bare @startuml / @enduml blocks ---
  md.block.ruler.before(
    "fence",
    "plantuml",
    function(state, startLine, endLine, silent) {
      const pos = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      const firstLine = state.src.slice(pos, max).trim();

      // Allow an optional leading backslash (markdown escape) before @startuml
      if (!firstLine.startsWith("@startuml") && !firstLine.startsWith("\\@startuml")) return false;

      if (silent) return true;

      const nameMatch = /^\\?@startuml\b[ \t]*(\S+)?/i.exec(firstLine);
      const name = nameMatch ? nameMatch[1] ?? null : null;

      let nextLine = startLine + 1;
      let found = false;

      while (nextLine < endLine) {
        const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
        const lineEnd = state.eMarks[nextLine];
        const lineContent = state.src.slice(lineStart, lineEnd).trim();

        if (lineContent === "@enduml" || lineContent === "\\@enduml") {
          found = true;
          break;
        }
        nextLine++;
      }

      if (!found) return false;

      // Collect content between the delimiter lines (exclusive).
      const contentLines: string[] = [];
      for (let i = startLine + 1; i < nextLine; i++) {
        const lineStart = state.bMarks[i];
        const lineEnd = state.eMarks[i];
        contentLines.push(state.src.slice(lineStart, lineEnd));
      }

      state.line = nextLine + 1;

      const token = state.push("plantuml", "div", 0);
      token.content = contentLines.join("\n");
      token.block = true;
      token.map = [startLine, nextLine + 1];
      token.meta = { name };

      return true;
    },
    {}
  );
}
