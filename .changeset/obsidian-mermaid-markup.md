---
"@quartz-community/rehype-obsidian": patch
---

Mermaid diagrams in Obsidian's markup (`div.mermaid`, as obsidian-flavored-markdown renders them with Pele) get the expand button and popup in a `div.mermaid-diagram` around them, instead of inside a code block. Diagrams in code blocks (`pre > code.mermaid`) keep them as before.
