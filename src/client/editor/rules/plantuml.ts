/**
 * markdown-it rule to parse PlantUML blocks.
 *
 * Parses blocks delimited by @startuml / @enduml and emits a "plantuml"
 * block token whose .content holds the raw diagram source (without the
 * delimiter lines).
 */
export default function plantumlRule(md): void {
  md.block.ruler.before(
    "fence",
    "plantuml",
    function(state, startLine, endLine, silent) {
      const pos = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      const firstLine = state.src.slice(pos, max).trim();

      if (!firstLine.startsWith("@startuml")) return false;

      if (silent) return true;

      let nextLine = startLine + 1;
      let found = false;

      while (nextLine < endLine) {
        const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
        const lineEnd = state.eMarks[nextLine];
        const lineContent = state.src.slice(lineStart, lineEnd).trim();

        if (lineContent === "@enduml") {
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

      return true;
    },
    {}
  );
}
