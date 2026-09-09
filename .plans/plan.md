# Mermaid diagram support alongside PlantUML

## Context

inkwell.md currently supports exactly one diagram language: PlantUML. A
` ```plantuml ` fence is intercepted by a markdown-it rule
(`src/client/editor/rules/plantuml.ts`), turned into a dedicated ProseMirror
node (`src/client/editor/nodes/PlantUml.tsx`), and rendered by shelling out to
`vendor/plantuml.jar` on the extension host (`src/host/plantUmlRenderer.ts`) —
which requires a local Java install.

Mermaid is the other diagram syntax users write in markdown, and GitHub/GitLab
render it natively, so ` ```mermaid ` fences are already common in the kinds of
docs this editor targets. Today they fall through to the generic `CodeFence`
node and show as plain code.

Goal: ` ```mermaid ` fences get the same treatment as PlantUML — inline
diagram preview in the rich editor, split source/preview pane on selection,
and clean round-tripping back to the same markdown fence. Unlike PlantUML,
Mermaid renders **in the webview** (the `mermaid` npm package), so there is no
host round-trip, no message factory, and no Java prerequisite.

Decisions taken with the user:

- **Render client-side** in the webview, not host-side.
- **Inline fences only** — no `.mmd` sidecar/external-file feature (the
  PlantUML `plantumlExternalFiles` machinery is not mirrored).
- **Refactor to a shared diagram view** — extract the common split-pane /
  preview / error UI out of `PlantUml.tsx` so both diagram types use it.

## Step 0 — worktree and in-repo plan file

```
git worktree add -b feat/mermaid-diagrams .worktrees/feat/mermaid-diagrams main
code --add .worktrees/feat/mermaid-diagrams
```

Inside that worktree create `.plans/plan.md` holding this plan (the repo has no
`.plans` folder yet — note the existing PlantUML design doc lives at
`.claude/plans/plantuml-external-files.md`, so `.plans/` is a new location).
All work below happens in `.worktrees/feat/mermaid-diagrams`.

## Architecture

Mermaid's renderer returns an **SVG string**. The existing preview UI displays
an **image data URI** (`<img src>` / `InlinePanZoomViewer`, and the webview CSP
already allows `img-src … data:`). So the mermaid renderer wraps its SVG into
`data:image/svg+xml;base64,…` and the shared view stays format-agnostic — no
changes to `InlinePanZoomViewer` or the CSP in
`richMarkdownEditorProvider.ts:643`.

Nothing on the host side changes: no new message factory in
`src/common/messages/`, no handler in `richMarkdownEditorProvider.ts`, no hook
in `editorHost.tsx`. This also sidesteps a real limitation of
`useBidirectionalEvent` (`src/client/messages/useBedirectonalEvent.ts`): it
keeps a single in-flight resolve/reject pair per message factory, which is the
reason `PlantUml.tsx` needs a module-level render queue. Mermaid still
serialises renders, but only because mermaid itself mutates global DOM state.

## Changes

### 1. Shared diagram view — `src/client/editor/components/DiagramEditorView.tsx` (new)

Extract, verbatim where possible, from `PlantUml.tsx`:

- the `CodeMirrorEditor` component and its `cmTheme` (lines 280–404)
- the serialized render queue (`queuePlantUmlRender`, lines 17–28) generalised
  into a per-instance/per-language queue factory
- the whole `PlantUmlView` body: debounced (250 ms) re-render on source change,
  `renderIdRef` staleness guard, loading/error states, the selected split-pane
  (`EditorContainer` / `SourcePane` / `PreviewPane` / `PaneLabel`), the
  unselected `InlinePanZoomViewer` view with `FallbackPre`, `handleSelect`,
  `enterEditMode`, `handleCodeMirrorChange` (lines 406–654 and the
  styled-components at 780–859)

Props: `node`, `isSelected`, `isEditable`, `getPos`, `view`, plus
`label` (pane heading, e.g. `"PlantUML"` / `"Mermaid"`),
`render?: (source: string) => Promise<{ imageData: string }>`,
`whiteBackground?: boolean` and `alt`. When `render` is undefined the view
falls back to `FallbackPre` — this is what keeps `server.ts` (SSR/tests)
working without pulling in a renderer.

`PlantUml.tsx` keeps only what is PlantUML-specific: the whole skinparam/CSS-var
theming block (lines 31–274, including the `' vscode-style` opt-in and the
themed→plain retry fallback), the `@startuml`/`@enduml` `toMarkdown`, and the
external-file naming in `commands()`. It passes a `render` closure that applies
theming and calls `this.options.onRenderPlantUml`.

### 2. Mermaid renderer — `src/client/editor/lib/mermaidRenderer.ts` (new)

- Lazy `const mermaid = (await import("mermaid")).default` so the library is
  only pulled in when a mermaid node actually renders, and never at module load
  (important for `server.ts` and Jest).
- `mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme, themeVariables })`.
  Derive `theme` (`"dark"` vs `"default"`) and `themeVariables` from the VS Code
  CSS variables — reuse the `getCssVar` / `getCssVarFirst` / `toHexColor`
  helpers currently in `PlantUml.tsx` by moving them to a shared
  `src/client/editor/lib/vscodeThemeColors.ts` rather than duplicating them.
  If the source contains a `%%{init:` directive, skip our theme override and
  let the document's own config win.
- Validate first with `await mermaid.parse(source, { suppressErrors: true })`
  and throw the parse message on failure — this avoids mermaid injecting its
  "bomb" error graphic into the DOM.
- `await mermaid.render(uniqueId, source)` → `{ svg }` → return
  `{ imageData: "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg))) }`.
- Renders are serialised through the shared queue (mermaid mutates global DOM
  state and IDs).

### 3. Markdown rule — `src/client/editor/rules/mermaid.ts` (new)

Mirror only *Format 1* of `rules/plantuml.ts`: a
`md.core.ruler.after("block", "mermaid_fence", …)` rule that rewrites `fence`
tokens whose `info.trim().toLowerCase() === "mermaid"` into `mermaid` tokens
(`tok.type = "mermaid"; tok.tag = "div"`). No delimiter stripping, no legacy
bare-block rule, no `name` meta.

Optionally factor the shared fence-interception loop into a small
`createFenceRule(lang)` helper used by both files.

### 4. Node — `src/client/editor/nodes/Mermaid.tsx` (new)

Modelled on `PlantUml.tsx`'s node class (lines 660–778), minus the naming:

- `name = "mermaid"`, `rulePlugins = [mermaidRule]`, `markdownToken = "mermaid"`
- schema: `content: "text*"`, `marks: ""`, `group: "block"`, `code: true`,
  `defining: true`, `selectable: true`, `parseDOM` on `div.mermaid-block` with
  `contentElement: "pre.mermaid-source"`, matching `toDOM`
- `toMarkdown`: write ` ```mermaid `, the raw text, ` ``` `, `closeBlock`
- `parseMarkdown`: `{ block: "mermaid", noCloseToken: true }`
- `component`: renders `DiagramEditorView` with `label="Mermaid"` and
  `render={this.options.onRenderMermaid}`
- `commands()`: insert a default diagram, e.g.
  ```
  flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Done]
    B -->|No| A
  ```

### 5. Registration and menu

- `src/client/editor/index.tsx` — import `Mermaid`, add
  `new Mermaid({ onRenderMermaid: renderMermaid })` next to the existing
  `new PlantUml({ … })` at line 557. The renderer is wired here (browser
  bundle) rather than threaded through `editorHost.tsx`.
- `src/client/editor/server.ts` — import and add `new Mermaid()` (no renderer)
  next to `new PlantUml()` at line 53, so parse/serialize round-trips work in
  SSR and tests without loading mermaid.
- `src/client/editor/dictionary.ts` — add `mermaid: "Mermaid diagram"` next to
  `plantUml` (line 63).
- `src/client/editor/menus/block.ts` — add a `{ name: "mermaid", title:
  dictionary.mermaid, icon: CodeIcon, keywords: "mermaid diagram flowchart
  sequence gantt class" }` entry next to the `plantuml` entry (line 129).
- `package.json` — add `mermaid` to `dependencies`.

### 6. Docs

`README.md` — add Mermaid to the feature list (near the PlantUML bullets at
lines 16–17) and note that, unlike PlantUML, Mermaid needs no Java and renders
in the webview.

## Risks / things to watch

- **Bundle size.** `mermaid` is large (~2–3 MB unminified). It is dynamically
  imported, but esbuild without `--splitting` inlines dynamic imports into the
  single `out/client.js`. Check `out/client.js` size after
  `npm run build`; if it becomes a problem, the follow-up is enabling
  `--splitting --format=esm` for the client build, which is out of scope here.
- **CSP.** `style-src` already includes `'unsafe-inline'`
  (`richMarkdownEditorProvider.ts:643`), which mermaid's injected `<style>`
  needs. `script-src` is nonce-only — verify mermaid does not require `eval`.
- **jsdom.** Keep the `import("mermaid")` lazy and inside the browser-only
  render path so `server.test.ts` and `renderToHtml.test.ts` never load it.

## Verification

1. `npm run lint` and `npm test` — both clean.
2. Add round-trip tests in `src/client/editor/server.test.ts`, mirroring the
   existing plantuml block (lines ~89–250): a ` ```mermaid ` fence must parse
   to a `mermaid` node and serialize back to the identical fence with the inner
   source untouched; a fence preceded/followed by prose still round-trips; and
   an unrelated fence (e.g. ` ```ts `) still becomes a `code_fence`.
3. `npm run build-debug`, then launch the extension host (F5) and open a
   markdown file under `testfolder/` containing a ` ```mermaid ` flowchart:
   - it renders as a diagram, not a code block;
   - clicking it opens the split source/preview pane, and edits re-render
     within ~250 ms;
   - an intentionally broken diagram shows the mermaid parse error in the
     preview pane and the raw source in the collapsed view — no bomb graphic;
   - toggling raw/source mode and back leaves the fence byte-identical;
   - switching VS Code between a light and a dark theme and reopening the
     document produces a readable diagram in both.
4. Confirm existing PlantUML behaviour is unchanged after the shared-view
   refactor: inline fence, the `' vscode-style` opt-in, the legacy bare
   `@startuml`/`@enduml` block, and the sidecar mode with
   `inkwell-md.plantumlExternalFiles` enabled.
