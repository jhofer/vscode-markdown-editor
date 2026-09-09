# Minimize document churn: faithful markdown round trip

## Context

Opening `testfolder/problem-file.md` in the Inkwell editor dirties the document and rewrites it
with no user edit at all. The host already skips no-op writes (`updateTextDocument`,
`richMarkdownEditorProvider.ts:713`, compares against `document.getText()`), so the churn is real:
the markdown → ProseMirror → markdown round trip is lossy.

The underlying cause is structural, not a single bug. The parser keeps only the *semantics* of
each construct and throws away the *markup* that expressed it, so the serializer regenerates every
construct from hard-coded literals. Anywhere the source didn't happen to match those literals, the
file gets rewritten. Two node types already do it right — `BulletList` stores the bullet character
in an attr, `HorizontalRule` stores its `markup` — and that pattern is what the rest needs.

Two goals, in priority order:

1. **Opening a file changes nothing.** `git diff` stays empty until the user edits.
2. **Editing changes as little as possible.** A one-word edit touches one line; newly created
   nodes adopt the file's prevailing style rather than the editor's hard-coded defaults.

Decisions taken with the user: soft-wrapped lines render as a visible line break (not joined into
flowing text); table delimiters are preserved verbatim from source rather than normalized. The
reported "one more dash per open" is out of scope — the only delimiter writer in the codebase is a
constant literal, so it should be a one-time 3→4 normalization, and preserving the source
delimiter makes it moot.

## Confirmed churn sources

Measured against the reported file (deltas 1-3), then found by auditing every `toMarkdown` /
`parseMarkdown` pair and `lib/markdown/serializer.js`:

| # | Construct | What happens | Where |
|---|---|---|---|
| 1 | Soft-wrapped paragraph | Each source newline becomes a **paragraph break** (blank line inserted) | `rules/breaks.ts` splits `softbreak` tokens into separate paragraphs |
| 2 | Table delimiter row | `\|---\|---\|` → `\|----\|----\|`, rebuilt from alignment only | `serializer.js:332-342` |
| 3 | Ordered list | Extra blank line before the list | `OrderedList.toMarkdown` opens with `state.write("\n")` |
| 4 | Horizontal rule | Same spurious leading blank line | `HorizontalRule.toMarkdown` writes `\n${markup}` |
| 5 | Setext heading | `Title\n=====` → `# Title` | `Heading.parseMarkdown` keeps `level`, drops `token.markup` |
| 6 | Ordered list numbering | `1.` / `1.` / `1.` → `1.` / `2.` / `3.` | `OrderedList.toMarkdown` writes `start + i` |
| 7 | Ordered list delimiter | `1)` → `1.` | `token.markup` (`.` or `)`) not read |
| 8 | List indentation | Nested items re-indented to a fixed 2 spaces (bullets) / marker width + 2 (ordered) | `BulletList`/`OrderedList` `toMarkdown` delim args |
| 9 | Code fence | `~~~` → ```` ``` ````; fence length and info-string spacing normalized | `CodeFence.toMarkdown` writes a literal ```` ``` ```` |
| 10 | Indented code block | Converted to a fenced block | `CodeBlock extends CodeFence` with no own `toMarkdown` |
| 11 | Emphasis delimiters | `_em_` → `*em*`, `__strong__` → `**strong**` | `Italic`/`Bold` `toMarkdown` fixed `open`/`close` |
| 12 | Escaping | ``` ` ``` `*` `\` `~` `[` `]` escaped in **all** prose, so `a [note]` → `a \[note\]` | `serializer.js:360` `esc()` |
| 13 | Table cell padding | `\|a\|b\|` → `\| a \| b \|` | `renderTable` writes `"\| "` / `" \| "` |
| 14 | Blockquote | `>text` → `> text` | `Blockquote.toMarkdown` `wrapBlock("> ")` |
| 15 | New nodes on edit | Nesting (Tab) or toggling a list builds a fresh list node with **default** attrs, so a `*` list yields `-` children | `commands/toggleList.ts` (`setNodeMarkup` with no attrs, `wrapInList`), `sinkListItem` |

Item 15 is the `*` → `-` on edit. Note the bullet char *is* already preserved for lists that come
from the file — it's only list nodes **created during editing** that fall back to the default.

## Approach

Three mechanisms, applied repeatedly rather than fifteen ad-hoc fixes:

- **A. Markup attrs.** Every node whose markdown has more than one spelling stores the source
  spelling in an attr at parse time and re-emits it at serialize time, falling back to today's
  literal when the attr is absent (new nodes, pasted content). Follows the existing
  `BulletList.bullet` / `HorizontalRule.markup` precedent.
- **B. Document style defaults.** At parse time, record the document's prevailing style (bullet
  char, ordered delimiter and numbering style, indent width, fence char, emphasis delimiters) and
  use it as the default for nodes created while editing, instead of hard-coded literals. This is
  what makes goal 2 hold.
- **C. A round-trip test corpus.** Fixture `.md` files plus a test asserting
  `serialize(parse(md)) === md`, so each construct is locked down and new ones are a one-line
  addition.

Per `CLAUDE.md`, work happens on a worktree branch:

```
git worktree add -b fix/markdown-roundtrip-fidelity .worktrees/fix-markdown-roundtrip-fidelity main
```

## Phase 1 — opening a file changes nothing

This phase alone makes the reported file round-trip clean.

### 1a. Preserve soft line breaks (items 1)

**New** `src/client/editor/nodes/SoftBreak.ts`, modelled on `nodes/HardBreak.ts`:

- `name` = `soft_break`, `markdownToken` = `"softbreak"` — this is what registers the token with
  the prosemirror-markdown parser (`lib/ExtensionManager.ts:71-93`); without it the parser throws
  on an unhandled `softbreak`.
- schema: `inline: true`, `group: "inline"`, `selectable: false`,
  `parseDOM: [{ tag: "br.soft-break" }]`, `toDOM: () => ["br", { class: "soft-break" }]`.
- `parseMarkdown()` → `{ node: "soft_break" }`.
- `toMarkdown(state)` → `state.write(state.inTable ? " " : "\n")`. `inTable` is set by
  `renderTable` (`serializer.js:307`); a literal newline inside a table cell would destroy the
  table. Use `state.write`, not raw `out +=` — `write` re-applies `state.delim`, so a soft break
  inside a list item or blockquote keeps its continuation indent.
- No `keys()`/`commands()`: soft breaks come only from parsing. Enter still makes a paragraph,
  Shift-Enter still makes a hard break.

Register in **both** extension lists next to `new HardBreak()`: `src/client/editor/server.ts:45`
and `src/client/editor/index.tsx:542`.

Rewrite `src/client/editor/rules/breaks.ts` to stop splitting on `softbreak`, keeping only the
standalone-backslash branch of `isBreak` (`token.type === "text" && token.content === "\\"`) —
that is what makes the `preserveEmptyParagraphs` setting round-trip, since `Paragraph.toMarkdown`
writes `"\\\n"` for an empty paragraph and relies on this rule to turn it back into one. Verify
during implementation that markdown-it really emits a bare `text: "\\"` token there (a `\` at
end-of-line becomes `hardbreak` instead); if it arrives as `hardbreak`, keep the `\` form with a
`markup` attr on the `br` node.

Do **not** set `breaks: true` in `lib/markdown/rules.ts` — that turns soft breaks into `hardbreak`
tokens, which serialize as `"  \n"` and reintroduce churn.

### 1b. Preserve table delimiter rows (item 2)

`src/client/editor/rules/tables.ts` — add a **forward pass before** the existing backward loop
(that loop derives `tokens[i].info` from `attrs[0][1]`, so don't add attrs to `th_open`; use the
token's free-form `meta` field):

- Split `state.src` into lines once; for each `table_open`, the delimiter row is
  `lines[token.map[0] + 1]`.
- Strip one leading and one trailing `|`, split on `|`, keep each segment **verbatim including
  surrounding whitespace** (` -------- `, `:----:`, `---`).
- Guard: use the captured segments only if every one matches `/^\s*:?-+:?\s*$/` and the count
  matches the column count. This rejects tables nested in blockquotes/lists (where the source line
  carries a `> ` prefix) and any line-map surprise, falling back to today's behaviour.
- Attach each segment to the corresponding `th_open` of the first row:
  `token.meta = { ...token.meta, delimiter: segment }`.

`src/client/editor/nodes/TableHeadCell.ts` — add `delimiter: { default: null }` to the schema
attrs, read as `delimiter: tok.meta?.delimiter ?? null` in `parseMarkdown().getAttrs`.

`serializer.js` `renderTable` (the `if (i === 0)` block) — compute the default from
`cell.attrs.alignment` as today, then use `cell.attrs.delimiter` instead **only if** its implied
alignment still matches `cell.attrs.alignment` (leading+trailing `:` → center, leading → left,
trailing → right, else null). A re-aligned column then falls back to the default, and columns
added in the editor have no stored delimiter and use the default too.

### 1c. Spurious leading blank lines (items 3, 4)

Delete the opening `state.write("\n")` in `OrderedList.toMarkdown` and change
`HorizontalRule.toMarkdown` to `state.write(node.attrs.markup)`. `renderList` → `flushClose`
already emits the block separator, which is why `BulletList.toMarkdown` needs no equivalent and
why upstream prosemirror-markdown has neither. Cover with a test that a paragraph immediately
followed by an ordered list (and by an `hr`) still serializes with exactly one blank line between.

### 1d. Heading, list and fence markup (items 5-10)

Apply mechanism **A** to each, reading `token.markup` / `token.info` in `parseMarkdown` and
re-emitting in `toMarkdown`:

- `nodes/Heading.ts` — attr `markup` (`"#"` vs `"="`/`"-"` for setext) and the source's trailing
  hashes if present; emit setext form when that's what the file used.
- `nodes/OrderedList.ts` — attrs `delimiter` (`.` or `)`) and `numbering`: record whether the
  source counted up or repeated the same number, and reproduce it instead of always writing
  `start + i`. Also derive the continuation indent from the source rather than `maxW + 2`.
- `nodes/BulletList.ts` — attr for the source indent width alongside the existing `bullet`.
- `nodes/CodeFence.ts` — attrs `fence` (the exact ```` ``` ````/`~~~` run, preserving length) and
  the raw info string; `nodes/CodeBlock.ts` needs its own `toMarkdown` that re-emits an indented
  block instead of inheriting the fenced one.

### 1e. Whitespace-only normalizations (items 13, 14)

- `renderTable` — record the source cell padding (from the same line-map read as 1b) or, simpler,
  emit `"|"`/`" | "` based on a per-table `padded` attr captured at parse time.
- `Blockquote.toMarkdown` — attr for `"> "` vs `">"`.

Both are lower value than the rest; if they complicate 1b, defer them to phase 2 and note it.

## Phase 2 — editing changes as little as possible

### 2a. Emphasis delimiters (item 11)

`marks/Italic.ts` and `marks/Bold.ts` take their `open`/`close` from a mark attr captured from
`token.markup` (`*` vs `_`, `**` vs `__`), falling back to the document default (2c). Watch the
interaction with `marks/Underline.ts`, which *emits* `__` while markdown-it parses `__x__` as
`strong` — decide explicitly which wins and cover both in the corpus.

### 2b. Stop over-escaping (item 12)

`serializer.js` `esc()` currently escapes ``` ` ``` `*` `\` `~` `[` `]` unconditionally. Make it
context-sensitive: escape a character only where it could actually be re-parsed as markup (`[`
only when a `](` or `][` follows, `*`/`` ` ``/`~` only when they'd form a delimiter run). This is
the riskiest change here — under-escaping produces *wrong* markdown, which is worse than churn —
so it lands last and leans on the corpus, including adversarial cases (`2 * 3`, `a_b_c`,
`[not a link]`, `~approx`, a lone backtick).

### 2c. Document style defaults (item 15)

Derive a `DocumentStyle` at parse time (dominant bullet char, ordered delimiter and numbering
style, indent width, fence char, emphasis delimiters) and use it for nodes created while editing:

- `commands/toggleList.ts` — `setNodeMarkup(parentList.pos, listType)` passes no attrs, so
  everything resets to defaults; pass the inherited/dominant attrs instead. Same for `wrapInList`.
- The `Tab`-to-nest path (`sinkListItem` in `nodes/ListItem.ts`) — the new inner list must inherit
  its parent list's attrs. This is the concrete `*` → `-` you hit.
- `lib/editorSettings.ts` is the natural home for the inferred style, alongside the existing
  `preserveEmptyParagraphs` setting.

## Tests

Existing tests that encode the old soft-break behaviour need updating:

- `lib/renderToHtml.test.ts:169` "renders softbreaks as separate paragraphs" — rename and
  re-record the snapshot at `lib/__snapshots__/renderToHtml.test.ts.snap:98`. `renderToHtml` runs
  markdown-it's own HTML renderer with `breaks: false`, so once the splitting rule is gone the
  expected HTML is one `<p>` with plain newlines rather than `<br>`s. It's exported but unused
  inside the app (`server.ts:90`, re-exported from `index.tsx:93`), so this is low-risk.
- `server.test.ts:48` "parses mixed softbreaks and hardbreaks" — assertions are loose, but the
  comment and intent change to "softbreak → soft_break node".

**The round-trip corpus is the main new test** and should land first, red, in phase 1. Fixture
`.md` files under `src/test/fixtures/` (`.md` files are string-exported by
`jest-md-transformer.js`), one per construct family, each asserted with
`serializer.serialize(parser.parse(md), undefined) === md` using the headless `parser`/
`serializer` from `src/client/editor/server.ts`. Seed it from the reported file: soft-wrapped
paragraphs, `|---|---|` and Prettier-padded and aligned tables, a paragraph immediately followed
by an ordered list, hard breaks, nested lists. Then one fixture per row of the churn table above,
so each fix has a failing test before it and a passing one after.

## Adjacent issue (noted, not scheduled)

`rules/tables.ts` turns an escaped literal `\n` inside a table cell into a `br` token, and
`HardBreak.toMarkdown` writes `"  \n"` unconditionally — which corrupts the table on the way out.
The same `state.inTable` guard as the new `SoftBreak` node fixes it in one line. Say the word and
it goes into phase 1.

## Verification

1. `npm test` — corpus green, two snapshots re-recorded. `npm run lint`.
2. `npm run build-debug`, F5, open `testfolder/problem-file.md`: no dirty dot, `git diff` empty,
   wrapped paragraphs render as line breaks inside one paragraph block. Toggle to raw mode and
   back — still no diff.
3. Edit a single word, save: `git diff` shows that one line only, no collateral reflow.
4. In a list written with `*`, press Enter for a new item and Tab to nest one — both stay `*`.
5. Open a Prettier-formatted file (padded table delimiters `| -------- | :----: |`, `_em_`,
   4-space list indents) and a file using setext headings, `~~~` fences and `1)` markers — close
   without editing, `git diff` empty.
