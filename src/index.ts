import type { Root } from "hast";

import { blockReferences } from "./lib/block-references.js";
import { checkbox } from "./lib/checkbox.js";
import { mermaidExpand } from "./lib/mermaid-expand.js";
import { youTubeEmbed } from "./lib/youtube-embed.js";

export interface RehypeObsidianOptions {
  blockReferences?: boolean;
  youTubeEmbed?: boolean;
  checkbox?: boolean;
  mermaid?: boolean;
}

const defaultOptions: Required<RehypeObsidianOptions> = {
  blockReferences: true,
  youTubeEmbed: true,
  checkbox: true,
  mermaid: true,
};

export default function rehypeObsidian(userOpts?: RehypeObsidianOptions) {
  const opts = { ...defaultOptions, ...userOpts };
  return (tree: Root, file: { data?: Record<string, unknown> }) => {
    if (opts.blockReferences) blockReferences(tree, file);
    if (opts.youTubeEmbed) youTubeEmbed(tree);
    if (opts.checkbox) checkbox(tree);
    if (opts.mermaid) mermaidExpand(tree);
  };
}

export { blockReferences, youTubeEmbed, checkbox, mermaidExpand };
