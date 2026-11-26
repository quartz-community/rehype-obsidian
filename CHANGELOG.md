## 1.6.0

### Minor Changes

- ab4a6bb: Blocks get the id `^name` (was `name`), and same-page block links point at it (`#^name`), so a block and a heading of the same name no longer share an id: block `^para-1` is `#^para-1`, heading `## Para 1` stays `#para-1`, as in Obsidian, where blocks and headings are separate namespaces. `file.data.blocks` is still keyed by the bare name (`para-1`). New export `blockElementId(name)`. URLs of links to blocks change from `#id` to `#^id`; pair with `@quartz-community/utils` 1.3.2, whose `splitAnchor` keeps the `^`.

## 1.5.1

### Patch Changes

- 3a6d7ae: Same-page block links reach their block: `blockReferences` points `[x](#^id)` and `[[#^id]]` (`href="#%5Eid"`) at the id it gives the block (`#id`), as Obsidian follows them. Same-page anchors used to be resolved only before block ids existed (github-flavored-markdown#12).
- 6359569: YouTube embeds only for images on YouTube (`youtube.com`, `youtu.be`, `youtube-nocookie.com`): an image whose path looked like a video, such as `https://….r2.dev/Sisifo.webp` (`v/` and an 11-character name), became a YouTube iframe (obsidian-flavored-markdown#13).

## 1.5.0

### Minor Changes

- 651e608: Each top-level block of a note is wrapped in the div Obsidian's reading view puts it in (`div.el-p > p`, `div.el-h2 > h2`, `div.el-pre` around code blocks and diagrams, `div.el-div` around callouts and display maths, `div.el-section` around the footnotes). Themes space blocks with these wrappers, and their `:first-child` / `:last-child` rules match each block in its own wrapper; 145 registry themes style them. The wrappers have no styles of their own, so sites without a theme look the same. Runs after the other steps, and leaves an already wrapped tree alone. Turn off with `blockWrappers: false`; `isBlockWrapper` is exported for code that walks a note's top-level blocks.
- 62bde50: Obsidian's fold arrows (`collapseIndicators`): `span.heading-collapse-indicator` opens each of the note's headings, and `span.list-collapse-indicator` each list item with a sublist (after its bullet, before a task's checkbox), with Obsidian's `right-triangle` icon. Themes style and move them. They don't fold anything by themselves, so a site hides them unless it folds headings or lists (Quartz does). Turn off with `collapseIndicators: false`.
- a9ddf99: Footnotes closer to Obsidian's (`footnoteMarkup`): items have `data-footnote-id`, back-links read `↩︎` right after the text, and an inline footnote's text (`^[…]`) is the item's own, not in a paragraph. `footnoteHeading: false` drops the "Footnotes" heading GFM opens the list with (`h2.sr-only`), as Obsidian has none and themes' heading rules count it: the rule is then the section's first child, the heading's text names the section (`aria-label`), and references no longer point at it. It stays by default, since Quartz doesn't hide `.sr-only` and shows it as a heading.

### Patch Changes

- e0ca6e2: Footnotes use Obsidian's markup, which themes style: references are `sup.footnote-ref > a.footnote-link` reading `[1]`, the footnotes open with a rule (`section.footnotes > hr`), and back-links are `a.footnote-backref.footnote-link`. Turn off with `footnoteMarkup: false`.
- 0fc2fc1: Headings carry Obsidian's `data-heading` attribute (the heading's text), which themes select headings by (`h2[data-heading]`; 31 registry themes, such as ITS's illusion headings). Turn off with `headingData: false`.
- b0c8d0a: Bullet lists use Obsidian's markup, `ul.has-list-bullet` with each item opening with `span.list-bullet`, where Obsidian and themes draw bullets (custom shapes, glyphs and colours per level). Without Obsidian's CSS the span is empty and the list marker stays. Turn off with `listBullets: false`.
- ffc1a82: Mermaid diagrams in Obsidian's markup (`div.mermaid`, as obsidian-flavored-markdown renders them with Pele) get the expand button and popup in a `div.mermaid-diagram` around them, instead of inside a code block. Diagrams in code blocks (`pre > code.mermaid`) keep them as before.
- 22c1166: Unchecked tasks get `data-task=""`, as in Obsidian, instead of `data-task=" "`, so themes' rules for unchecked checkboxes apply.

## 1.4.0

### Minor Changes

- d837024: Task checkboxes carry Obsidian's `task-list-item-checkbox` class; block references (`^id`) also name callouts rendered as `<div class="callout">`.

## 1.3.0

### Minor Changes

- 9c4fc0f: A wikilink's `^id` is no longer read as a block identifier, as in Obsidian 1.15.0. `[[n#^id]]` renders `n > ^id` and `[[n|a ^id]]` renders `a ^id`, and neither gives the paragraph an id. Before, the `^id` was cut from the link's text and named the paragraph. A Markdown link's text is read as before: `[a ^id](n)` renders `a ` and names the paragraph.

  The integrator marks links built from wikilinks with `data-wikilink` (new export `WIKILINK_PROPERTY`, the hast property name). Unmarked links are read as Markdown links.

## 1.2.1

### Patch Changes

- 4e21fb5: A block reference is stripped only from text that ends its wrapper or table cell, as Obsidian
  renders it: `| ^blk[[w]] |` and `==a ^blk [[w]]==` keep their `^blk`, while `==a ^blk== b`
  still strips it.

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
