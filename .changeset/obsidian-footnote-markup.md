---
"@quartz-community/rehype-obsidian": patch
---

Footnotes use Obsidian's markup, which themes style: references are `sup.footnote-ref > a.footnote-link` reading `[1]`, the footnotes open with a rule (`section.footnotes > hr`), and back-links are `a.footnote-backref.footnote-link`. Turn off with `footnoteMarkup: false`.
