# Mermaid demo

A flowchart:

```mermaid
flowchart TD
  A[Start] --> B{Decision}
  B -->|Yes| C[Done]
  B -->|No| A
```

Some prose between two diagrams.

A sequence diagram:

```mermaid
sequenceDiagram
  participant Alice
  participant Bob
  Alice->>Bob: Authentication Request
  Bob-->>Alice: Authentication Response
```

An intentionally broken diagram (should show a parse error in the preview

pane, and the raw source in the collapsed view — never a "bomb" graphic):

```mermaid
flowchart TD
  A --> ??? -->
```

A regular fenced code block that must stay a code block, not a diagram:

```ts
const answer = 42;
```
