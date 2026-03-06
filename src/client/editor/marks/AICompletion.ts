import Mark from "./Mark";
import aiCompletionRule from "../rules/aiCompletion";

export default class AICompletion extends Mark {
  get name() {
    return "ai_completion";
  }

  get schema() {
    return {
      parseDOM: [
        { 
          tag: "span.ai-completion",
        },
      ],
      toDOM: () => [
        "span",
        {
          class: "ai-completion",
          style: "color: #999; opacity: 0.7; font-style: italic;",
        },
        0,
      ],
    };
  }

  get toMarkdown() {
    return {
      open: "[AI]",
      close: "[/AI]",
      mixable: false,
      expelEnclosingWhitespace: false,
    };
  }

  parseMarkdown() {
    return { mark: "ai_completion" };
  }

  get rulePlugins() {
    return [aiCompletionRule];
  }

  // No input rules - AI completion marks are only inserted programmatically
  inputRules() {
    return [];
  }

  // No keyboard shortcuts - handled globally in the editor
  keys() {
    return {};
  }

  // No toggle command - AI completion is managed by acceptance/rejection
  commands() {
    return () => () => false;
  }
}
