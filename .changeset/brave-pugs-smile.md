---
"@quartz-community/rehype-obsidian": minor
---

Render a footnote reference nothing defines as its bare label.

`remark-obsidian` now keeps an undefined `[^x]` as a real `footnoteReference`
so the source round-trips; flattening it in the tree let a formatter write `x`
back over `[^x]`. That leaves the drop to the renderer: `mdast-util-to-hast`
turns every reference into `<sup><a href="#user-content-fn-x">`, which for an
undefined one links to a target that was never emitted. Obsidian shows the
bare label, so the marker is replaced here.

The name comes from the unreachable target, not the anchor text, which holds
the ordinal the renderer assigned rather than the label. Detection treats
`data-footnote-ref` as present rather than strictly `true`, because `rehype-raw`
re-parses the tree through HTML on the way here and a bare attribute arrives as
the empty string.

Removing a marker also closes the gap it left in the numbering. References are
numbered as they are met, so a bared one still consumed an ordinal: with `[^a]`
undefined and `[^b]` defined, the surviving marker rendered as `2` where
Obsidian shows `1`. Numbering by first appearance of each target restores that
and keeps repeated references to one definition sharing a number.

New `bareFootnotes` option, on by default.
