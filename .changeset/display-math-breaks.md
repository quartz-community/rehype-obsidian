---
"@quartz-community/rehype-obsidian": minor
---

New `displayMathBreaks` option, on by default: the line break straight after display math in a
paragraph (`a $$y^2$$` over `b`) is dropped, as Obsidian renders it. `remark-obsidian`'s
`legacy` preset keeps the line ending as a `break`, since the source holds one, and it rendered
as an empty line under the formula. Recognises `remark-obsidian`'s `math-display`, KaTeX's
`katex-display` and MathJax's display container.
