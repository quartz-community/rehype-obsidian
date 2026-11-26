---
"@quartz-community/rehype-obsidian": patch
---

Same-page block links reach their block: `blockReferences` points `[x](#^id)` and `[[#^id]]` (`href="#%5Eid"`) at the id it gives the block (`#id`), as Obsidian follows them. Same-page anchors used to be resolved only before block ids existed (github-flavored-markdown#12).
