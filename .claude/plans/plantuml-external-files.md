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
* the SVGs are generated under `<root>/<attachments>/<dir-of-md>/<md-basename>/<name>.svg`, where
  `<root>` is the git repository root (falling back to the workspace folder), matching the existing
  `getPathRootFolder()` / `/`-prefixed-link convention already used by pasted images, and
  `<attachments>` is the configurable attachments folder (default `.attachments`).

**The editing experience must not change**: inline source editing with live preview stays exactly as
it is today.

**We are guests in a shared folder.** Both the markdown file and the attachments folder can contain
images that have nothing to do with PlantUML (pasted screenshots, hand-written `![](...)` links,
files another tool put in `.attachments`). The feature must therefore be strictly *additive* and
never assume it owns an image or a folder — see "Ownership rules" below.

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
* **Configurable attachments folder.** `.attachments` is only the default (it matches the Azure
  DevOps wiki convention); a repo that keeps generated assets elsewhere can set the folder name to
  e.g. `assets` or `docs/generated`.

### Ownership rules (non-PlantUML images must survive)

1. An image tag is converted back into an editable diagram **only if** its path resolves into *this
   document's* diagram folder (`<attachments>/<relDir>/<basename>/`) **and** its file stem matches a
   diagram name present in the sidecar. Every other image — a screenshot in the same
   `.attachments` tree, an `images/foo.png` link, an `http(s)` image — is passed through untouched
   and keeps rendering as a normal image node.
2. Pruning only ever deletes files inside this document's diagram folder whose stem matches
   `^<basename>-\d+$` and which are no longer a current diagram name. A screenshot dropped into that
   same folder is never deleted, and no file outside that folder is ever touched.
3. The diagram folder is removed after pruning **only if it is empty**; the attachments root itself
   is never removed.
4. Setting the attachments folder to a value that already holds unrelated content is safe by
   construction, because of 1–3.

Sidecar format (`docs/architecture.plantuml`):

```
@startuml architecture-1
Alice -> Bob: Authentication Request
@enduml

@startuml architecture-2
...
@enduml
```

## Settings

### Prerequisite fix

`package.json` declares the settings under `contributes.properties`, which is **not a VS Code
contribution point** — none of the current settings (`fontSize`, `fontFamily`,
`preserveEmptyParagraphs`) are actually registered; they only work because every read site passes a
hard-coded default. Rename it to `contributes.configuration` (`{ "title": "inkwell.md",
"properties": { ... } }`) so the new settings are togglable from the Settings UI.

### New settings

| Setting | Type | Default | Meaning |
| --- | --- | --- | --- |
| `inkwell-md.plantumlExternalFiles` | boolean | `false` | Store PlantUML sources in a `<name>.plantuml` sidecar and keep only a generated SVG image link in the markdown. |
| `inkwell-md.plantumlAttachmentsFolder` | string | `.attachments` | Folder (relative to the git repository root, or the workspace folder if the file is not in a repo) where the generated SVGs are written. |

Both are `scope: "window"` like the existing settings, and both take effect on the next editor open
(no `onDidChangeConfiguration` listener exists today — say so in the description, as
`preserveEmptyParagraphs` already does).

The attachments folder value is normalized before use: strip leading/trailing slashes, reject
absolute paths and `..` segments (fall back to `.attachments` and log a warning), and use posix
separators when building markdown links.

## Implementation

Branch: `feat/plantuml-external-files`.

### 1. `src/common/plantumlSidecar.ts` (new, pure — no `vscode`/`fs` imports, like `stripTrailingBlankLines.ts`)

All path-shaped functions take a `DocumentLayout = { attachmentsFolder, relDir, baseName }` so the
configurable folder is threaded through instead of hard-coding `.attachments`.

* `parseSidecar(text, baseName): Diagram[]` — split into `@startuml [name] … @enduml` blocks; blocks
  without a name get the next free `${baseName}-${n}`.
* `serializeSidecar(diagrams): string` — named blocks, blank line between.
* `diagramFolder(layout)` → `<attachmentsFolder>/<relDir>/<baseName>` (posix);
  `diagramPath(layout, name)` → `<folder>/<name>.svg`; `diagramLink(layout, name)` → the same with a
  leading `/`.
* `isDiagramLink(layout, src, names)` — the ownership check from rule 1: normalize `src` (accept it
  with or without the leading `/`, ignore `http(s)` and `data:`), require it to sit directly in
  `diagramFolder(layout)`, end in `.svg`, and have a stem in `names`.
* `isPrunableSvg(layout, fileName, currentNames)` — rule 2: `^<baseName>-\d+\.svg$` and not a
  current name.
* `extractDiagrams(markdown, layout): { markdown, diagrams }` — replace each ```` ```plantuml ````
  fence (and legacy bare `@startuml` block) with `![name](/<folder>/<name>.svg)`, allocating a name
  if absent and de-duplicating collisions. Leaves every other block and image untouched.
* `inlineDiagrams(markdown, diagrams, layout): string` — the inverse, gated on `isDiagramLink`:
  image tags that fail the check (normal images, screenshots that happen to live in the attachments
  tree, stale links) are left exactly as they are.
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

* `layoutFor(document, root, attachmentsFolder)` → `{ sidecarPath, relDir, baseName,
  attachmentsFolder, diagramDir }`; if the document is not under `root`, external mode is skipped
  for that document.
* `readSidecar(document)` → `Diagram[]` (empty when the file is missing).
* `writeDiagrams(document, diagrams, renderer)`:
  * write the sidecar (`fs.writeFileSync`, matching existing style), or delete it when the document
    has no diagrams left;
  * `mkdirSync(diagramDir, { recursive: true })`; render each diagram whose source changed (or whose
    `.svg` is missing) via `renderer.renderToSvg` and write `<name>.svg`;
  * prune: delete only files in `diagramDir` for which `isPrunableSvg` holds (rule 2), then
    `rmdirSync(diagramDir)` only if it is now empty — non-diagram files in the same folder keep it
    alive and are never removed;
  * On failure (e.g. no Java on PATH) log via `src/host/logger.ts` and show one
    `vscode.window.showErrorMessage`; the markdown and sidecar are still written.

### 4. `src/host/richMarkdownEditorProvider.ts`

* Read `inkwell-md.plantumlExternalFiles` (default `false`) and
  `inkwell-md.plantumlAttachmentsFolder` (default `.attachments`, normalized as described above)
  alongside the other `getConfiguration("inkwell-md")` reads; put both defaults in
  `src/host/constants.ts` next to `DEFAULT_FONT_SIZE`.
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

* `README.md` — add `inkwell-md.plantumlExternalFiles` and `inkwell-md.plantumlAttachmentsFolder` to
  the settings table (L46-75), each with type, default and "reopen the editor to take effect", and
  add a short "External PlantUML files" section under it (like the existing
  `preserveEmptyParagraphs` section) that shows the resulting layout:

  ```
  docs/architecture.md          ![architecture-1](/.attachments/docs/architecture/architecture-1.svg)
  docs/architecture.plantuml    @startuml architecture-1 … @enduml
  .attachments/docs/architecture/architecture-1.svg
  ```

  and states explicitly that only SVGs generated from that document's sidecar are managed —
  other images in the markdown and other files in the attachments folder are left alone.
* `src/test/plantumlSidecar.test.ts` (new, jest) — sidecar parse/serialize, extract→inline
  round-trip on the fence output that `PlantUml.toMarkdown` produces, name allocation/collisions,
  orphan detection, path building for a nested doc (`docs/architecture.md`), a custom attachments
  folder (`assets`), and the ownership rules: a screenshot link, an `http` image and an unrelated
  `.attachments/**/foo.png` must all survive `extract`→`inline` unchanged, and `isPrunableSvg` must
  reject a non-diagram file sitting in the diagram folder.
* `src/client/editor/server.test.ts` already round-trips PlantUML parse/serialize — extend with a
  named-diagram case.

## Known limitations (call out in the README)

* Renaming or moving the `.md` does not move the sidecar/attachments.
* Changing `plantumlAttachmentsFolder` on a repo that already has generated SVGs re-generates them
  under the new folder on the next save and rewrites the links, but does not clean up the old
  folder (deleting files outside the configured folder would violate the ownership rules).
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
7. **Coexistence check:** in the same document, paste a screenshot (it lands in `/images/…` via the
   existing upload handler) and drop an unrelated `photo.png` into
   `.attachments/docs/architecture/`. Edit and save the document repeatedly: both files must still
   exist, the screenshot must still render as a normal image node, and its markdown link must be
   byte-identical.
8. Set `inkwell-md.plantumlAttachmentsFolder` to `assets`, reopen, add a diagram, save → SVG lands in
   `assets/docs/architecture/…` and the link points there. The old `.attachments` files are left
   behind untouched (expected — document it).
9. Open the same file in VS Code's built-in markdown preview → the SVG renders.
10. Turn the flag off, open a file with an inline fence → today's behavior, byte-identical markdown.
