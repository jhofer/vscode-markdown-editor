# Inkwell.md

Edit markdown files with a rich editor in the style of Dropbox Paper/Notion etc., now with built-in PlantUML editing and preview.

 ![Demo](demo.gif)

Perfect for writing docs, authoring blog posts, and editing markdown website content.

## Features

* Preview and edit in a single view
* Format with markdown syntax or slash commands
* Syntax highlighting for code blocks
* Easily add tables, checkboxes, dividers, quotes, links etc
* **Edit links** with `Ctrl+K` / `Cmd+K` — opens a two-field dialog to set or update both the link title and URL; works on new text selections and on existing links with pre-populated values
* PlantUML blocks with side-by-side source editing and live diagram preview
* Theme-aware PlantUML rendering with optional styled skinparams (`' vscode-style`)
* **AI-powered completion suggestions** using GitHub Copilot (when available)
* Smart completion that respects line endings and markdown context
* Tab to accept, Escape to dismiss AI suggestions

This extension replaces the default code editor for markdown files with a rich version, allowing you to "edit" in preview mode.

It uses the [rich-markdown-editor](https://github.com/outline/rich-markdown-editor) project generously open sourced by [Outline](https://www.getoutline.com/)

## PlantUML Prerequisites

PlantUML support is **bundled with the extension** - no separate PlantUML installation required. The extension ships with all necessary PlantUML runtime files. You only need:

* **System dependencies:**
  * Java Runtime (JRE/JDK 8+) - required to run PlantUML
  * Graphviz (`dot` executable) - required for certain diagram types (class, component, state diagrams, etc.)

Installation links:

* Java: https://adoptium.net/
* Graphviz: https://graphviz.org/download/

After installation, ensure these commands are available in your terminal:

* Windows (PowerShell): `java -version` and `dot -V`
* macOS/Linux: `java -version` and `dot -V`

If `dot` is not found, add Graphviz `bin` to your `PATH` and reload VS Code.

## Settings

Configure the extension via VS Code settings (`Ctrl+,` / `Cmd+,`, then search for "inkwell"):

| Setting | Default | Description |
| --- | --- | --- |
| `inkwell-md.fontSize` | `16px` | Base font size used to render markdown. |
| `inkwell-md.fontFamily` | system UI font stack | Font family used to render markdown. |
| `inkwell-md.preserveEmptyParagraphs` | `false` | Preserve intentional empty paragraphs (blank lines) when saving. |
| `inkwell-md.plantumlExternalFiles` | `false` | Store PlantUML sources in a `<name>.plantuml` sidecar file and keep only a generated SVG link in the markdown, instead of an inline fenced code block. Reopen the editor for a change to take effect. |
| `inkwell-md.plantumlAttachmentsFolder` | `.attachments` | Folder (relative to the git repository root, or the workspace folder if the file isn't in a repo) where SVGs generated from external PlantUML files are written. Only used when `plantumlExternalFiles` is enabled. Reopen the editor for a change to take effect. |

### Preserving empty paragraphs

Standard markdown has no way to represent an empty paragraph: any number of
consecutive blank lines collapses into a single paragraph break when the file is
re-read. By default this extension follows that convention, so extra blank lines
you add in the editor are not kept on save.

If you want to keep intentional blank lines between content, enable
`inkwell-md.preserveEmptyParagraphs`. When enabled, each empty paragraph is saved
as a backslash (`\`) on its own line so it survives a reload, for example:

```markdown
Line A
\
\
Line B
```

Trailing blank lines at the end of the file are still trimmed. **Reopen the
editor after changing this setting** for it to take effect.

### External PlantUML files

By default, a PlantUML diagram's source lives inline in the markdown as a
```` ```plantuml ```` fence. Enable `inkwell-md.plantumlExternalFiles` to
instead store the source in a sidecar `.plantuml` file next to the markdown
document, and generate a real `.svg` file that's linked from the markdown as a
normal image. This keeps the markdown clean and lets other renderers (GitHub,
VS Code's built-in preview, Azure DevOps wiki) show the diagram instead of a
raw code block. The in-editor experience doesn't change — diagrams are still
edited inline with a live preview; only where the source and rendered image
are stored on disk changes, and only on save.

For `docs/architecture.md` with two diagrams, saving produces:

```
docs/architecture.md          ![architecture-1](/.attachments/docs/architecture/architecture-1.svg)
                               ![architecture-2](/.attachments/docs/architecture/architecture-2.svg)
docs/architecture.plantuml     @startuml architecture-1 … @enduml
                                @startuml architecture-2 … @enduml
.attachments/docs/architecture/architecture-1.svg
.attachments/docs/architecture/architecture-2.svg
```

Diagrams keep a stable name for life (`architecture-1`, `architecture-2`, …,
gaps allowed), so reordering or deleting a diagram doesn't rewrite unrelated
links or files. Only the SVGs generated from *this* document's sidecar are
ever touched: other images referenced by the markdown (pasted screenshots,
hand-written `![](...)` links) and other files that happen to live in the
attachments folder are always left alone, even if you point
`plantumlAttachmentsFolder` at a folder that already holds unrelated content.

Known limitations:

* Renaming or moving the `.md` file does not move its sidecar or attachments.
* Changing `plantumlAttachmentsFolder` on a repo that already has generated
  SVGs regenerates them under the new folder on the next save and rewrites
  the links, but does not clean up the old folder.
* With the setting turned **off**, a document that was previously
  externalized shows its diagrams as plain (non-editable) images — turning
  the setting back on restores inline editing. There's no automatic
  re-inlining while it's off.
* If Java is unavailable, the sidecar file and image links are still written,
  but the SVGs are not generated.

## Credits

This project is based on [Rich Markdown Editor VSC](https://github.com/patmood/rich-markdown-editor-vsc) by [@patmood](https://github.com/patmood). We're grateful for their excellent work in bringing rich markdown editing to VS Code.