---
"@quartz-community/rehype-obsidian": minor
---

Footnotes closer to Obsidian's (`footnoteMarkup`): the screen-reader heading GFM opens the list with (`h2.sr-only`) goes, since Obsidian has none and themes' heading rules (numbering, rules above headings) counted it; its text names the section (`aria-label`) and references no longer point at it. The rule is the section's first child, items have `data-footnote-id`, back-links read `↩︎` right after the text, and an inline footnote's text (`^[…]`) is the item's own, not in a paragraph.
