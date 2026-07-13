# External PlantUML files (sidecar `.plantuml` + generated SVGs)

## Context

Today a PlantUML diagram lives **inside** the markdown as a ```` ```plantuml ```` fence. The webview
parses it into a `plantuml` ProseMirror node (`src/client/editor/nodes/PlantUml.tsx`), and the host
renders it by spawning `java -jar vendor/plantuml.jar -pipe -tsvg`
(`src/host/plantUmlRenderer.ts`), returning a base64 SVG **data URI** that is never persisted. So the
diagram source pollutes the markdown, and any other renderer (GitHub, VS Code preview, Azure DevOps
wiki) shows a raw code block instead of a diagram.

This adds an opt-in setting that changes only *where the source is stored*:

* the PlantUML source moves to a sidecar file next to the markdown — `docs/architecture.md` →
  `docs/architecture.plantuml`;
* the markdown keeps only an image tag —
  `![architecture-1](/.attachments/docs/architecture/architecture-1.svg)`;
* the SVGs are generated under `<root>/.attachments/<dir-of-md>/<md-basename>/<name>.svg`, where
  `<root>` is the git repository root (falling back to the workspace folder), matching the existing
  `getPathRootFolder()` / `/`-prefixed-link convention already used by pasted images.

**The editing experience must not change**: inline source editing with live preview stays exactly as
it is today.

## Design

The whole feature lives in the **extension host**. The webview keeps working with fences; the host
translates on the way in and out:

* **Doc → webview** (`updateWebview`): read the sidecar, replace each of our `.attachments` image
  tags with the corresponding ```` ```plantuml ```` fence, then send that markdown as usual.
* **Webview → doc** (`updateMarkdown` handler): extract every fence into a `{name, source}` list,
  replace it with the image tag, and write *that* markdown to the `TextDocument` via the existing
  `updateTextDocument()` WorkspaceEdit. Keep the diagram list in memory on the editor context.
* **On `onDidSaveTextDocument`**: write `architecture.plantuml`, render each diagram to SVG, prune
  orphaned SVGs. Nothing touches disk while merely typing.

Decisions taken:

* **Stable names.** A diagram keeps its name for life (`architecture-1`, `architecture-2`, … gaps
  allowed) so reordering/deleting does not rewrite unrelated links or SVG files. The name is carried
  through the round-trip as `@startuml <name>` — valid PlantUML, and running `plantuml
  architecture.plantuml` from a CLI produces exactly the same filenames we do.
* **Auto-migration.** With the flag on, existing inline fences get a name assigned when the document
  is loaded and are externalized on the next save.
* **Plain SVG.** The on-disk SVG is rendered from the raw source, without the `' vscode-style`
  skinparam injection (that stays an editor-preview-only feature), so the committed file looks right
  in GitHub / VS Code preview.

Sidecar format (`docs/architecture.plantuml`):

```
@startuml architecture-1
Alice -> Bob: Authentication Request
@enduml

@startuml architecture-2
...
@enduml
```

## Prerequisite fix

`package.json` declares the settings under `contributes.properties`, which is **not a VS Code
contribution point** — none of the current settings (`fontSize`, `fontFamily`,
`preserveEmptyParagraphs`) are actually registered; they only work because every read site passes a
hard-coded default. Rename it to `contributes.configuration` (`{ "title": "inkwell.md",
"properties": { ... } }`) so the new flag is togglable from the Settings UI.

## Implementation

Branch: `feat/plantuml-external-files`.

### 1. `src/common/plantumlSidecar.ts` (new, pure — no `vscode`/`fs` imports, like `stripTrailingBlankLines.ts`)

* `parseSidecar(text, baseName): Diagram[]` — split into `@startuml [name] … @enduml` blocks; blocks
  without a name get the next free `${baseName}-${n}`.
* `serializeSidecar(diagrams): string` — named blocks, blank line between.
* `attachmentPath(relDir, baseName, name)` → `.attachments/<relDir>/<baseName>/<name>.svg` (posix);
  `attachmentLink(...)` → the same with a leading `/`.
* `extractDiagrams(markdown, baseName, relDir): { markdown, diagrams }` — replace each ```` ```plantuml ````
  fence (and legacy bare `@startuml` block) with `![name](/.attachments/…/name.svg)`, allocating a
  name if absent and de-duplicating collisions.
* `inlineDiagrams(markdown, diagrams, baseName, relDir): string` — the inverse: image tags that
  resolve into *our* attachment folder and match a diagram name become fences again. Images that
  don't match (normal images, stale links) are left alone.
* `nameFences(markdown, baseName): string` — assign names to still-unnamed inline fences (migration).

**Round-trip invariant:** `inlineDiagrams(extractDiagrams(x))  === x` for markdown emitted by the
webview. This is what keeps the client's echo guard (`isBasicallySame` in
`src/client/editorHost.tsx`) from remounting the editor and losing the cursor. Cover it with tests.

### 2. `src/host/plantUmlRenderer.ts`

Extract `renderToSvg(source): Promise<string>` from `renderToDataUri` (which becomes a thin wrapper).
Renders are already serialized per-process; reuse as-is.

### 3. `src/host/plantUmlExternalFiles.ts` (new)

Owns the vscode/fs side, reusing `getPathRootFolder(document)` from the provider (move it here or
pass the root in):

* `paths(document, root)` → `{ sidecarPath, relDir, baseName, attachmentsDir }`; if the document is
  not under `root`, external mode is skipped for that document.
* `readSidecar(document)` → `Diagram[]` (empty when the file is missing).
* `writeDiagrams(document, diagrams, renderer)`:
  * write / delete the sidecar (`fs.writeFileSync`, matching existing style);
  * `mkdirSync(attachmentsDir, { recursive: true })`; render each diagram whose source changed (or
    whose `.svg` is missing) via `renderer.renderToSvg` and write `<name>.svg`;
  * delete `*.svg` in `attachmentsDir` whose stem is no longer a diagram name; remove the folder if
    empty.
  * On failure (e.g. no Java on PATH) log via `src/host/logger.ts` and show one
    `vscode.window.showErrorMessage`; the markdown and sidecar are still written.

### 4. `src/host/richMarkdownEditorProvider.ts`

* Read `inkwell-md.plantumlExternalFiles` (default `false`) alongside the other
  `getConfiguration("inkwell-md")` reads.
* Extend `EditorContext` with `diagrams: Diagram[]` and `lastWritten: Diagram[]`.
* `updateWebview()` (~L57): when enabled, run `nameFences` + `inlineDiagrams` on
  `document.getText()` before computing `urlLookUp` and sending `updateMarkdownMessage.response`.
* `updateMarkdown` handler (~L200): when enabled, `extractDiagrams()` first; store `diagrams` on the
  context; pass the image-form markdown to `updateTextDocument()`.
* New `vscode.workspace.onDidSaveTextDocument` subscription (dispose it with the other two in
  `onDidDispose`): if the saved document is this context's document and the flag is on, call
  `writeDiagrams(...)`.
* *Optional:* a `FileSystemWatcher` on the sidecar so external edits to `architecture.plantuml`
  refresh the open editor via `updateWebview`.
* `getHtmlForWebview()`: inject `window.__RME_PLANTUML_EXTERNAL__` and `window.__RME_PLANTUML_BASENAME__`
  next to the existing `__RME_PRESERVE_EMPTY_PARAGRAPHS__`.

### 5. Webview — name round-trip only (small, contained)

* `src/client/editor/lib/editorSettings.ts` — add `plantumlExternal` / `plantumlBaseName` to
  `EditorSettings` / `getEditorSettings()` (same defensive `window` reads as today).
* `src/client/editor/rules/plantuml.ts` — capture the name off the `@startuml <name>` line into
  `token.meta = { name }` for both supported formats; keep stripping the delimiter lines so the
  CodeMirror pane shows the same content as today.
* `src/client/editor/nodes/PlantUml.tsx` —
  * `schema.attrs = { name: { default: null } }`, carried on `toDOM`/`parseDOM` as `data-name`;
  * `parseMarkdown()` → `{ block: "plantuml", noCloseToken: true, getAttrs: tok => ({ name: tok.meta?.name ?? null }) }`;
  * `toMarkdown()` writes `@startuml` + `" " + name` when a name is set (unchanged otherwise, so
    flag-off output is byte-identical to today);
  * `commands()` allocates `${plantumlBaseName}-${maxExistingIndex + 1}` when `plantumlExternal` is
    on, by scanning `state.doc` for existing `plantuml` node names. This is what keeps a
    *newly inserted* diagram from being renamed by the host and remounting the editor mid-typing.
  * `handleCodeMirrorChange` already recreates the node with `nodeAtPos.attrs` — the name survives.

### 6. Docs / tests

* `README.md` settings table (L46-75) — document the flag, the `.plantuml` sidecar, the
  `.attachments` layout, and that a reopen is needed for the setting to take effect.
* `src/test/plantumlSidecar.test.ts` (new, jest) — sidecar parse/serialize, extract→inline
  round-trip on the fence output that `PlantUml.toMarkdown` produces, name allocation/collisions,
  orphan detection, and path building for a nested doc (`docs/architecture.md`).
* `src/client/editor/server.test.ts` already round-trips PlantUML parse/serialize — extend with a
  named-diagram case.

## Known limitations (call out in the README)

* Renaming or moving the `.md` does not move the sidecar/attachments.
* With the flag **off**, a document that was already externalized shows the SVGs as plain images
  (no inline editing) — turning the flag back on restores editing. There is no automatic re-inlining.
* If Java is unavailable the sidecar and links are still written, but the SVGs are not generated.

## Verification

1. `npm test` and `npm run lint`.
2. `npm run build-debug`, then F5 ("Run Extension") with `testfolder/` open.
3. Enable `inkwell-md.plantumlExternalFiles`, create `testfolder/docs/architecture.md`, insert a
   PlantUML diagram from the slash menu, type into it — confirm the split source/preview pane and
   live rendering are unchanged, and that the cursor does **not** jump while typing.
4. Save. Expect on disk:
   * `testfolder/docs/architecture.md` containing only
     `![architecture-1](/.attachments/docs/architecture/architecture-1.svg)`;
   * `testfolder/docs/architecture.plantuml` with `@startuml architecture-1 … @enduml`;
   * `.attachments/docs/architecture/architecture-1.svg` at the repo root.
5. Close and reopen the file — the diagram must come back as an editable PlantUML node, not an image.
6. Add a second diagram *above* the first, save: the first must keep `architecture-1` (no renumbering).
   Delete a diagram, save: its `.svg` and sidecar entry must disappear.
7. Open the same file in VS Code's built-in markdown preview → the SVG renders.
8. Turn the flag off, open a file with an inline fence → today's behavior, byte-identical markdown.
