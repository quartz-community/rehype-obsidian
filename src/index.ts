import type { Root } from "hast";

import { bareFootnotes } from "./lib/bare-footnotes.js";
import {
  blockElementId,
  blockReferences,
  WIKILINK_PROPERTY,
} from "./lib/block-references.js";
import { blockWrappers, isBlockWrapper } from "./lib/block-wrappers.js";
import { checkbox } from "./lib/checkbox.js";
import { collapseIndicators } from "./lib/collapse-indicators.js";
import { colouredHighlights } from "./lib/coloured-highlights.js";
import { displayMathBreaks } from "./lib/display-math-breaks.js";
import { footnoteMarkup } from "./lib/footnote-markup.js";
import { headingData } from "./lib/heading-data.js";
import { listBullets } from "./lib/list-bullets.js";
import { mermaidExpand } from "./lib/mermaid-expand.js";
import { obsidianUri } from "./lib/obsidian-uri.js";
import { stripComments } from "./lib/strip-comments.js";
import { tweetEmbed } from "./lib/tweet-embed.js";
import { youTubeEmbed } from "./lib/youtube-embed.js";

export interface RehypeObsidianOptions {
  blockReferences?: boolean;
  youTubeEmbed?: boolean;
  tweetEmbed?: boolean;
  checkbox?: boolean;
  mermaid?: boolean;
  obsidianUri?: boolean;
  /** Remove the empty `<obsidian-comment>` markers `remark-obsidian` leaves for kept `%%` comments. */
  stripComments?: boolean;
  /** Render a footnote reference nothing defines as its bare label, as Obsidian does. */
  bareFootnotes?: boolean;
  /** Obsidian's footnote classes, `[1]` labels and the rule above the footnotes, which themes style. */
  footnoteMarkup?: boolean;
  /**
   * Keep GFM's "Footnotes" heading (`h2.sr-only`) in the footnotes, as Quartz shows it (it
   * doesn't hide `.sr-only`). Off, as in Obsidian: no heading, which themes' heading rules
   * would count; its text names the section. With `footnoteMarkup`.
   */
  footnoteHeading?: boolean;
  /** Obsidian's bullet markup (`ul.has-list-bullet`, `span.list-bullet`), where themes draw bullets. */
  listBullets?: boolean;
  /**
   * Obsidian's fold arrows (`span.heading-collapse-indicator` in the note's
   * headings, `span.list-collapse-indicator` in list items with a sublist),
   * which themes style. They don't fold anything here: hide them unless the
   * site folds headings or lists.
   */
  collapseIndicators?: boolean;
  /** Obsidian's `data-heading` attribute (the heading's text), which themes select headings by. */
  headingData?: boolean;
  /**
   * Colour a highlight from its leading emoji and drop the marker, as Obsidian
   * 1.14 does. `remark-obsidian` keeps the emoji in the tree on purpose, so the
   * strip belongs here, where it becomes output.
   */
  colouredHighlights?: boolean;
  /** Drop the `<br>` after display math in a paragraph, which Obsidian does not render. */
  displayMathBreaks?: boolean;
  /**
   * Wrap each top-level block in the div Obsidian's reading view puts it in
   * (`div.el-p > p`, `div.el-h2 > h2`), which themes space blocks with.
   */
  blockWrappers?: boolean;
}

const defaultOptions: Required<RehypeObsidianOptions> = {
  blockReferences: true,
  youTubeEmbed: true,
  tweetEmbed: true,
  checkbox: true,
  mermaid: true,
  obsidianUri: true,
  stripComments: true,
  bareFootnotes: true,
  footnoteMarkup: true,
  footnoteHeading: true,
  listBullets: true,
  collapseIndicators: true,
  headingData: true,
  colouredHighlights: true,
  displayMathBreaks: true,
  blockWrappers: true,
};

export default function rehypeObsidian(userOpts?: RehypeObsidianOptions) {
  const opts = { ...defaultOptions, ...userOpts };
  return async (tree: Root, file: { data?: Record<string, unknown> }) => {
    if (opts.blockReferences) blockReferences(tree, file);
    if (opts.youTubeEmbed) youTubeEmbed(tree);
    if (opts.tweetEmbed) await tweetEmbed(tree);
    if (opts.checkbox) checkbox(tree);
    if (opts.mermaid) mermaidExpand(tree);
    if (opts.obsidianUri) obsidianUri(tree);
    if (opts.stripComments) stripComments(tree);
    if (opts.bareFootnotes) bareFootnotes(tree);
    if (opts.footnoteMarkup)
      footnoteMarkup(tree, { heading: opts.footnoteHeading });
    if (opts.listBullets) listBullets(tree);
    if (opts.collapseIndicators) collapseIndicators(tree);
    if (opts.headingData) headingData(tree);
    if (opts.colouredHighlights) colouredHighlights(tree);
    if (opts.displayMathBreaks) displayMathBreaks(tree);
    // Last: the steps above find blocks at the top level.
    if (opts.blockWrappers) blockWrappers(tree);
  };
}

export {
  bareFootnotes,
  collapseIndicators,
  blockWrappers,
  isBlockWrapper,
  footnoteMarkup,
  headingData,
  listBullets,
  colouredHighlights,
  displayMathBreaks,
  blockReferences,
  blockElementId,
  youTubeEmbed,
  tweetEmbed,
  checkbox,
  mermaidExpand,
  obsidianUri,
  stripComments,
  WIKILINK_PROPERTY,
};
