import type { Element, ElementContent, Root } from "hast";
import { visit } from "unist-util-visit";

const textOf = (nodes: ElementContent[]): string =>
  nodes
    .map((n) =>
      n.type === "text"
        ? n.value
        : n.type === "element"
          ? textOf(n.children)
          : "",
    )
    .join("");

/**
 * Obsidian marks each heading with its text, `<h2 data-heading="Intro">`, and
 * themes select headings by it (`h2[data-heading]`, ITS's illusion headings).
 */
export const headingData = (tree: Root): void => {
  visit(tree, "element", (node: Element) => {
    if (!/^h[1-6]$/.test(node.tagName)) return;
    if (node.properties.dataHeading !== undefined) return;
    node.properties.dataHeading = textOf(node.children).trim();
  });
};
