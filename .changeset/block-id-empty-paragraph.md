---
"@quartz-community/rehype-obsidian": patch
---

A block identifier on its own line after a list, table or paragraph (`^id`) no longer leaves an empty paragraph (and, with block wrappers on, an empty `div.el-p`) behind; it is removed, as Obsidian renders none.
