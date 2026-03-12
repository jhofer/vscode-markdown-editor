import * as React from "react";
import ReactNode from "./ReactNode";
import mermaidRule from "../rules/mermaid";

let mermaidIdCounter = 0;

function MermaidDiagram({ node }: { node: any }) {
  const idRef = React.useRef(`mermaid-${++mermaidIdCounter}-${Math.random().toString(36).slice(2)}`);
  const [svg, setSvg] = React.useState<string>("");
  const [error, setError] = React.useState<string>("");

  React.useEffect(() => {
    const code = node.attrs.content;
    if (!code) return;

    let cancelled = false;
    import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false });
      mermaid
        .render(idRef.current, code)
        .then(({ svg: rendered }) => {
          if (!cancelled) {
            setSvg(rendered);
            setError("");
          }
        })
        .catch(err => {
          if (!cancelled) {
            setError((err && err.message) || "Failed to render diagram");
            setSvg("");
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [node.attrs.content]);

  if (error) {
    return (
      <pre
        style={{
          padding: "8px",
          background: "rgba(255,0,0,0.05)",
          border: "1px solid rgba(255,0,0,0.3)",
          borderRadius: "4px",
          color: "red",
          whiteSpace: "pre-wrap",
        }}
      >
        {error}
      </pre>
    );
  }

  if (!svg) {
    return (
      <div
        style={{ padding: "8px", opacity: 0.5, fontStyle: "italic" }}
        contentEditable={false}
      >
        Rendering diagram…
      </div>
    );
  }

  return (
    <div
      contentEditable={false}
      dangerouslySetInnerHTML={{ __html: svg }}
      style={{ overflowX: "auto" }}
    />
  );
}

export default class Mermaid extends ReactNode {
  get name() {
    return "mermaid_diagram";
  }

  get schema() {
    return {
      attrs: {
        content: {
          default: "",
        },
      },
      group: "block",
      atom: true,
      draggable: true,
      parseDOM: [
        {
          tag: "div.mermaid-diagram",
          getAttrs: (dom: HTMLDivElement) => ({
            content: dom.getAttribute("data-content") || "",
          }),
        },
      ],
      toDOM: (node: any) => [
        "div",
        {
          class: "mermaid-diagram",
          "data-content": node.attrs.content,
        },
        0,
      ],
    };
  }

  get rulePlugins() {
    return [mermaidRule];
  }

  component({ node }: { node: any }) {
    return <MermaidDiagram node={node} />;
  }

  commands({ type }: { type: any }) {
    return (attrs: any) => (state: any, dispatch: any) => {
      dispatch(
        state.tr.replaceSelectionWith(type.create(attrs)).scrollIntoView()
      );
      return true;
    };
  }

  toMarkdown(state: any, node: any) {
    state.write("```mermaid\n");
    state.write(node.attrs.content);
    state.ensureNewLine();
    state.write("```");
    state.closeBlock(node);
  }

  get markdownToken() {
    return "mermaid_diagram";
  }

  parseMarkdown() {
    return {
      node: "mermaid_diagram",
      getAttrs: (token: any) => ({
        content: token.attrGet("content") || "",
      }),
    };
  }
}
