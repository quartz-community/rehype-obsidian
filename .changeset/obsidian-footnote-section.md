---
"@quartz-community/rehype-obsidian": minor
---

Footnotes closer to Obsidian's (`footnoteMarkup`): items have `data-footnote-id`, back-links read `↩︎` right after the text, and an inline footnote's text (`^[…]`) is the item's own, not in a paragraph. `footnoteHeading: false` drops the "Footnotes" heading GFM opens the list with (`h2.sr-only`), as Obsidian has none and themes' heading rules count it: the rule is then the section's first child, the heading's text names the section (`aria-label`), and references no longer point at it. It stays by default, since Quartz doesn't hide `.sr-only` and shows it as a heading.
