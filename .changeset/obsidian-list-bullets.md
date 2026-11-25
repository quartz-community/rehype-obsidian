---
"@quartz-community/rehype-obsidian": patch
---

Bullet lists use Obsidian's markup, `ul.has-list-bullet` with each item opening with `span.list-bullet`, where Obsidian and themes draw bullets (custom shapes, glyphs and colours per level). Without Obsidian's CSS the span is empty and the list marker stays. Turn off with `listBullets: false`.
