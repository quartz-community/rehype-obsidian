---
"@quartz-community/rehype-obsidian": minor
---

Colour a highlight from its leading emoji, as Obsidian 1.14 does

1.14 reads a leading pictograph in a highlight as a colour, consuming it: the
character leaves both the rendered text and the highlight's content, and the
`mark` element carries `data-highlight`. `remark-obsidian` keeps the emoji in
the tree on purpose — the file on disk still holds it, so dropping it from a
node value would let a formatter delete the author's character — which puts the
strip here, where it becomes output.

Twelve markers map onto six colours, each written either as a circle or as a
square, and the mapping is read from Obsidian's own rendered HTML rather than
guessed. Three details are measured: the strip is by codepoint, so
`==🔴️ text==` leaves the variation selector orphaned where a grapheme-aware
strip would swallow it; only a leading marker counts and only the first, so the
inner `🟢` of `==🔴 a ==🟢 b==` stays text; and whatever whitespace followed the
marker survives.

Now required rather than forward-looking: 1.14.4 is the current public release.
