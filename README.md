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

PlantUML support ships with the extension's bundled `node-plantuml` runtime dependency. You only need local system tooling.

* **System dependencies:**
  * Java Runtime (JRE/JDK 8+)
  * Graphviz (`dot` executable) for Graphviz-based diagrams such as class, component, and state diagrams

Installation links:

* Java: https://adoptium.net/
* Graphviz: https://graphviz.org/download/

After installation, ensure these commands are available in your terminal:

* Windows (PowerShell): `java -version` and `dot -V`
* macOS/Linux: `java -version` and `dot -V`

If `dot` is not found, add Graphviz `bin` to your `PATH` and reload VS Code.

## Credits

This project is based on [Rich Markdown Editor VSC](https://github.com/patmood/rich-markdown-editor-vsc) by [@patmood](https://github.com/patmood). We're grateful for their excellent work in bringing rich markdown editing to VS Code.