import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

const classesOf = (node: Element): string[] => {
  const cur: unknown = node.properties.className;
  return Array.isArray(cur)
    ? cur.map(String)
    : typeof cur === "string"
      ? cur.split(/\s+/).filter(Boolean)
      : [];
};

/**
 * Obsidian's bullet markup: `ul.has-list-bullet`, each item opening with an
 * empty `span.list-bullet`. Obsidian's CSS hides the list marker and draws the
 * bullet on that span, and themes restyle it there (shapes, glyphs, colours per
 * level). Without Obsidian's CSS the span is empty and the marker stays.
 */
export const listBullets = (tree: Root): void => {
  visit(tree, "element", (node: Element) => {
    if (node.tagName !== "ul") return;
    const classes = classesOf(node);
    if (!classes.includes("has-list-bullet"))
      node.properties.className = [...classes, "has-list-bullet"];
    for (const li of node.children) {
      if (li.type !== "element" || li.tagName !== "li") continue;
      const first = li.children.find((c) => c.type === "element");
      if (
        first?.type === "element" &&
        first.tagName === "span" &&
        classesOf(first).includes("list-bullet")
      )
        continue;
      li.children.unshift({
        type: "element",
        tagName: "span",
        properties: { className: ["list-bullet"] },
        children: [],
      });
    }
  });
};
