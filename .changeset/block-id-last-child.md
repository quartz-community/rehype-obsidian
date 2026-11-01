---
"@quartz-community/rehype-obsidian": patch
---

A block reference is stripped only from text that ends its wrapper or table cell, as Obsidian
renders it: `| ^blk[[w]] |` and `==a ^blk [[w]]==` keep their `^blk`, while `==a ^blk== b`
still strips it.
