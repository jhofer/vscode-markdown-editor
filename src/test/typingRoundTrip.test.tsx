/**
 * Types into the real EditorHost while a fake extension host answers
 * updateMarkdown requests after a delay (and, in some scenarios, changes the
 * document on its own), and checks after every keystroke that the caret is
 * still right after the text typed so far: nothing rolled back, nothing moved
 * to another line.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import { EditorHost } from "../client/editorHost";
import { updateMarkdownMessage } from "../common/messages/updateMarkdown";
import { stripTrailingBlankLines } from "../common/stripTrailingBlankLines";

// Keep hold of the editor's ProseMirror view to type into it.
const mockViews: EditorView[] = [];
jest.mock("prosemirror-view", () => {
  const actual = jest.requireActual("prosemirror-view");
  class TrackedEditorView extends actual.EditorView {
    constructor(...args: unknown[]) {
      super(...args);
      mockViews.push(this as unknown as EditorView);
    }
  }
  return { ...actual, EditorView: TrackedEditorView };
});

// Messages the webview posts; the host picks them up asynchronously.
const mockPosted: { message: { type: string; payload: any } }[] = [];
const mockHost = { onPost: () => undefined as void };
jest.mock("../client/utils/vscode", () => ({
  vscode: {
    postMessage: (request: { message: { type: string; payload: any } }) => {
      mockPosted.push(request);
      setTimeout(() => mockHost.onPost(), 0);
    },
    getState: () => undefined,
    setState: () => undefined,
  },
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const URI = "file:///doc.md";
const LATENCY = 350;

function deliver(message: unknown) {
  window.dispatchEvent(
    new MessageEvent("message", { data: { documentUri: URI, message } })
  );
}

type Scenario = {
  initial: string;
  // The caret starts right after this text.
  after: string;
  // "\n" presses Enter.
  typed: string;
  crlf?: boolean;
  // Like files.autoSave + files.trimTrailingWhitespace: this long after the
  // host last applied an edit, the document is saved and trailing whitespace
  // trimmed, which reaches the webview as an external change.
  trimAfter?: number;
  // Some other edit to the file lands this many ms into the typing.
  externalEditAt?: number;
  // Pause after each keystroke, in ms, cycled.
  rhythm?: number[];
};

const scenarios: Record<string, Scenario> = {
  "end of a paragraph": {
    initial: "first line\n\nsecond line\n",
    after: "first line",
    typed: " hello world this is fast typing",
  },
  "end of a paragraph, CRLF": {
    initial: "first line\r\n\r\nsecond line\r\n",
    after: "first line",
    typed: " hello world this is fast typing",
    crlf: true,
  },
  "pressing Enter": {
    initial: "first line\n\nsecond line\n",
    after: "first line",
    typed: " one\ntwo three\nfour",
  },
  "list item": {
    initial: "- one\n- two\n- three\n",
    after: "two",
    typed: " and more words here\nnew item text",
  },
  "table cell": {
    initial: "| a | b |\n|---|---|\n| one | two |\n| three | four |\n",
    after: "one",
    typed: " more words in the cell",
  },
  "saving trims the space just typed": {
    initial: "first line\n\nsecond line\n",
    after: "first line",
    typed: " hello world this is typing",
    trimAfter: 1000,
    rhythm: [30, 2500, 60, 700, 90],
  },
  "saving trims the space just typed, table cell": {
    initial: "| a | b |\n|---|---|\n| one | two |\n| three | four |\n",
    after: "one",
    typed: " more words in the cell",
    trimAfter: 1000,
    rhythm: [30, 2500, 60, 700, 90],
  },
  "saving trims while still typing": {
    initial: "first line\n\nsecond line\n",
    after: "first line",
    typed: " hello world this is typing",
    trimAfter: 100,
    rhythm: [30, 600, 150, 150, 150, 150],
  },
  "another edit lands while typing": {
    initial: "first line\n\nsecond line\n",
    after: "first line",
    typed: " hello world this is typing",
    externalEditAt: 700,
    rhythm: [30, 600, 150, 150, 150, 150],
  },
};

describe("typing while the host round trip is slow", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, "log").mockImplementation(() => undefined);
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockPosted.length = 0;
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test.each(Object.entries(scenarios))("%s", async (_name, scenario) => {
    // The fake extension host.
    let documentText = scenario.initial;
    const matchEol = (text: string) =>
      scenario.crlf ? text.replace(/\r?\n/g, "\r\n") : text;
    let trimTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleTrim = () => {
      if (scenario.trimAfter === undefined) return;
      clearTimeout(trimTimer);
      trimTimer = setTimeout(() => {
        const trimmed = documentText.replace(/[ \t]+(\r?\n)/g, "$1");
        if (trimmed !== documentText) {
          documentText = trimmed;
          deliver(updateMarkdownMessage.response(documentText, {}, documentText));
        }
      }, scenario.trimAfter);
    };
    mockHost.onPost = () => {
      while (mockPosted.length) {
        const { message } = mockPosted.shift()!;
        if (message.type === "ready-request") {
          deliver(updateMarkdownMessage.response(documentText, {}, documentText));
        } else if (message.type === updateMarkdownMessage.requestType) {
          const { markdownText, revision } = message.payload;
          setTimeout(() => {
            documentText = matchEol(stripTrailingBlankLines(markdownText));
            deliver(
              updateMarkdownMessage.response(documentText, {}, documentText, revision)
            );
            scheduleTrim();
          }, LATENCY);
        }
      }
    };
    if (scenario.externalEditAt !== undefined) {
      setTimeout(() => {
        documentText = documentText.replace("second line", "second line, edited");
        deliver(updateMarkdownMessage.response(documentText, {}, documentText));
      }, scenario.externalEditAt);
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<EditorHost documentUri={URI} />);
    });
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    const view = mockViews[mockViews.length - 1];

    let caret = -1;
    view.state.doc.descendants((node, pos) => {
      if (caret === -1 && node.isText && node.text!.includes(scenario.after)) {
        caret = pos + node.text!.indexOf(scenario.after) + scenario.after.length;
      }
    });
    expect(caret).toBeGreaterThan(-1);
    await act(async () => {
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, caret))
      );
    });

    const rhythm = scenario.rhythm ?? [30, 80, 210, 120, 400, 60];
    let expected = scenario.after;
    for (let i = 0; i < scenario.typed.length; i++) {
      const char = scenario.typed[i];
      await act(async () => {
        if (char === "\n") {
          view.someProp("handleKeyDown", (handle) =>
            handle(view, new KeyboardEvent("keydown", { key: "Enter" }))
          );
        } else {
          const { from, to } = view.state.selection;
          const handled = view.someProp("handleTextInput", (handle) =>
            handle(view, from, to, char)
          );
          if (!handled) view.dispatch(view.state.tr.insertText(char));
        }
        jest.advanceTimersByTime(rhythm[i % rhythm.length]);
      });

      expected = char === "\n" ? "" : expected + char;
      const { $head } = view.state.selection;
      const typedSoFar = JSON.stringify(scenario.typed.slice(0, i + 1));
      expect({
        typedSoFar,
        caretAfter: $head.parent.textBetween(0, $head.parentOffset),
      }).toEqual({ typedSoFar, caretAfter: expected });
    }

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(documentText.replace(/\r\n/g, "\n")).toContain(
      scenario.typed.split("\n").pop()!.trim()
    );
    root.unmount();
  });
});
