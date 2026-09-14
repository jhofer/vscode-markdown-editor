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


```mermaid
flowchart LR
  %% Technical Context - communication types/formats
  consumer["Consumer System\nAPP-1234"]
  provider["Provider Service\nAPP-5678"]
  queue["Message Queue\nAPP-2345"]
  iam["IAM: Keycloak\nOAuth2/JWT"]
  sys(("Target System\nAPP-XXXX"))

  consumer -->|"HTTPS / JSON\n(sync, READ)"| sys
  sys -->|"HTTPS / JSON\n(sync, WRITE)"| provider
  sys -->|"MQ / JSON\n(async, WRITE)"| queue
  sys -.->|"OAuth2 / JWT\n(authentication)"| iam

  %% Notes:
  %% - Show protocol/format and sync/async
  %% - Keep it black-box; no internal decomposition
```
