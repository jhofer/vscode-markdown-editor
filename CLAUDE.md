# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Workflow

- Always start a new request on a new git worktree branch, not on `main` or an existing branch's working directory. Create it with:

  ```
  git worktree add -b <branch-name> .worktrees/<branch-name> main
  code --add .worktrees/<branch-name> 
  ```

  Then do all work for that request inside `.worktrees/<branch-name>`.
- `.worktrees/` is gitignored — don't commit anything from it into the main working tree.

# Commands

- `npm run build` — production build (esbuild, minified): bundles both the extension host and the webview client.
- `npm run build-debug` — same as above without minification, for debugging.
- `npm run watch-client` / `npm run watch-extension` — esbuild watch mode for the webview client or the extension host respectively.
- `npm run lint` — ESLint over `.ts`/`.tsx`.
- `npm test` — run the Jest suite. Run a single file with `npx jest path/to/file.test.ts`, or a single test with `npx jest -t "test name"`.
- `npm run package` — build a `.vsix` via `vsce package` (runs `prepare:plantuml-assets` first).
- `npm run publish:patch` / `:minor` / `:major` / `:preview` / `:release` — version bump + publish via `vsce`.

# Architecture

The extension registers a VS Code `CustomTextEditorProvider` (`inkwell.md`) for `*.md`/`*.markdown` files with priority `"option"`. `src/extension.ts` auto-switches a plain-text markdown tab to this custom editor when it becomes active (skipping diff views, so source-control diffs still use the built-in text diff).

The code is split into three layers:

- `src/host` — runs in the extension host (Node). `RichMarkdownEditorProvider` (`richMarkdownEditorProvider.ts`) is the entry point: it owns one `EditorContext` (webview panel + `vscode.TextDocument` + message broker) per open document, registers message handlers, and is the source of truth — the `TextDocument` is the model, kept in sync with the webview in both directions.
- `src/client` — runs in the webview (React, bundled separately as `out/client.js`).
- `src/common` — types/messages shared by both sides.

**Host ↔ webview protocol**: `src/common/messages/*` defines one `IMessageFactory` per message kind (e.g. `updateMarkdown`, `uploadImage`, `searchLink`, `renderPlantUml`), each with a `requestType`/`responseType`/`errorType` and `request()`/`response()`/`error()` builders. `HostMessageBroker` (`src/host/hostMessageBroker.ts`) and its client-side counterpart route messages by `documentUri` + `type`. Adding a new host↔client capability means adding a message factory here and registering a handler in `richMarkdownEditorProvider.ts` (host) and the corresponding hook in `editorHost.tsx` (client).

**Rich text editor**: a ProseMirror-based editor (adapted from Outline's rich-markdown-editor) under `src/client/editor`, organized as an extension system — `nodes/`, `marks/`, `plugins/`, `commands/`, `queries/`, `rules/`. `ExtensionManager` (`src/client/editor/lib/ExtensionManager.ts`) aggregates the registered extensions into the ProseMirror schema, the markdown-it-based parser (via `prosemirror-markdown` + custom rules), the markdown serializer, keymaps, input rules, and commands. New formatting features are typically added as a new node/mark/plugin extension rather than by modifying the editor core.

**Raw/source mode**: a CodeMirror editor (`src/client/rawEditor`). `EditorHost` (`src/client/editorHost.tsx`) owns which mode is active, debounces rich-editor → markdown updates before sending them to the host, and guards against "echo" updates (content the client itself just sent coming back from the host).

**Path resolution**: `/`-prefixed image and link paths are resolved against the containing **git repository root** (found by walking up from the document looking for a `.git` entry), not the VS Code workspace root — the opened workspace folder may be a parent of the actual repo (see `findGitRepositoryRoot`/`getPathRootFolder` in `richMarkdownEditorProvider.ts`).

**Host-side integrations**:

- `CopilotProvider` (`src/host/copilotProvider.ts`) — inline completions via VS Code's Language Model API, restricted to free-tier model families to avoid cost.
- `PlantUmlRenderer` (`src/host/plantUmlRenderer.ts`) — shells out to a bundled `vendor/plantuml.jar` (requires a local Java install) to render PlantUML source to an SVG data URI.

**Build**: esbuild bundles `src/extension.ts` → `out/extension.js` (CJS, node platform, external `vscode`) and the `src/client` webview entry → `out/client.js` separately. `vscode:prepublish` runs `prepare:plantuml-assets` (`scripts/preparePlantumlAssets.js`) before `build`.

**Tests**: Jest with `jsdom` environment, `@swc/jest` for `.ts`/`.tsx`. `.md` files are transformed to plain string exports by `jest-md-transformer.js` (see fixtures in `src/test/fixtures`). `.worktrees/` is excluded from test discovery.
