---
"@quartz-community/rehype-obsidian": minor
---

Blocks get the id `^name` (was `name`), and same-page block links point at it (`#^name`), so a block and a heading of the same name no longer share an id: block `^para-1` is `#^para-1`, heading `## Para 1` stays `#para-1`, as in Obsidian, where blocks and headings are separate namespaces. `file.data.blocks` is still keyed by the bare name (`para-1`). New export `blockElementId(name)`. URLs of links to blocks change from `#id` to `#^id`; pair with `@quartz-community/utils` 1.3.2, whose `splitAnchor` keeps the `^`.
