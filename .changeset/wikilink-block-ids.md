---
"@quartz-community/rehype-obsidian": minor
---

A wikilink's `^id` is no longer read as a block identifier, as in Obsidian 1.15.0. `[[n#^id]]` renders `n > ^id` and `[[n|a ^id]]` renders `a ^id`, and neither gives the paragraph an id. Before, the `^id` was cut from the link's text and named the paragraph. A Markdown link's text is read as before: `[a ^id](n)` renders `a ` and names the paragraph.

The integrator marks links built from wikilinks with `data-wikilink` (new export `WIKILINK_PROPERTY`, the hast property name). Unmarked links are read as Markdown links.
