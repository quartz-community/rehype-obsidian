---
"@quartz-community/rehype-obsidian": minor
---

Remove the empty `<obsidian-comment>` markers that `remark-obsidian` leaves for kept `%%` comments, behind a new `stripComments` option (default on).

`remark-obsidian` now keeps `comment` nodes in the mdast tree so a consumer can see where comments are — a linter needs that, and it is what lets a block-level view report a comment at all. Those nodes carry `data.hChildren: []`, so the comment body never reaches the page; what survives into hast is an empty element. This strips it.

Without this the page gains a stray empty tag, never the comment text.
