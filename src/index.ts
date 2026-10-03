import type { Root } from "hast";

import { blockReferences } from "./lib/block-references.js";
import { checkbox } from "./lib/checkbox.js";
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
}

const defaultOptions: Required<RehypeObsidianOptions> = {
  blockReferences: true,
  youTubeEmbed: true,
  tweetEmbed: true,
  checkbox: true,
  mermaid: true,
  obsidianUri: true,
  stripComments: true,
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
  };
}

export {
  blockReferences,
  youTubeEmbed,
  tweetEmbed,
  checkbox,
  mermaidExpand,
  obsidianUri,
  stripComments,
};
