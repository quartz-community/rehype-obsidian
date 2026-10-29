## 1.2.0

### Minor Changes

- 6fdedcc: New `displayMathBreaks` option, on by default: the line break straight after display math in a
  paragraph (`a $$y^2$$` over `b`) is dropped, as Obsidian renders it. `remark-obsidian`'s
  `legacy` preset keeps the line ending as a `break`, since the source holds one, and it rendered
  as an empty line under the formula. Recognises `remark-obsidian`'s `math-display`, KaTeX's
  `katex-display` and MathJax's display container.

### Patch Changes

- d13a60e: Block references are read as Obsidian renders them, recorded against Obsidian 1.15.0.

  - **Inside emphasis:** an identifier inside emphasis, a highlight or a strikethrough is
    stripped, not only one ending the paragraph's last text. `x **^blk** y` renders an empty
    `strong`, and the last identifier in the block names it, so `x **^blk** ^two` is `two`.
  - **In table cells:** an identifier in a table cell is stripped, and names the table.
  - **Which `^` counts:** only `^` followed by letters, digits or `-`, at the start of the text
    or after whitespace. `e^x`, `^a_b` and `^a.b` stay as written.
  - **After a link or emphasis:** a paragraph ending in an identifier after one
    (`x [l](u) ^blk`) keeps the identifier itself. It used to give it to the block before.

## 1.1.0

### Minor Changes

- 5878b77: Render a footnote reference nothing defines as its bare label.

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

  A reference inside link text (`[link [^x]](url)`) is bared too. Its marker
  nests an anchor inside the link, which `rehype-raw`'s HTML re-parse splits out
  beside it, past the reach of a `sup`-based match; the bare label now takes its
  place inside the link, as it does without `rehype-raw`.

  New `bareFootnotes` option, on by default.

- 7316307: Colour a highlight from its leading emoji, as Obsidian 1.14 does

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

  New `colouredHighlights` option, on by default.

- 694b420: Remove the empty `<obsidian-comment>` markers that `remark-obsidian` leaves for kept `%%` comments, behind a new `stripComments` option (default on).

  `remark-obsidian` now keeps `comment` nodes in the mdast tree so a consumer can see where comments are — a linter needs that, and it is what lets a block-level view report a comment at all. Those nodes carry `data.hChildren: []`, so the comment body never reaches the page; what survives into hast is an empty element. This strips it.

  Without this the page gains a stray empty tag, never the comment text.

## 1.0.0

### Major Changes

- Stable 1.0 release. All `@quartz-community/*` dependencies now use `^1.0.0` ranges.

  Pre-1.0 caret ranges pinned the minor version (`^0.2.1` means `>=0.2.1 <0.3.0`), so
  published fixes to shared packages could never be resolved by dependents. Moving the
  ecosystem to 1.0 makes caret ranges behave conventionally.
