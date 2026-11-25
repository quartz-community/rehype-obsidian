import type { Element, ElementContent, Root } from "hast";
import { visit } from "unist-util-visit";

const classesOf = (node: Element): string[] => {
  const cur: unknown = node.properties.className;
  return Array.isArray(cur)
    ? cur.map(String)
    : typeof cur === "string"
      ? cur.split(/\s+/).filter(Boolean)
      : [];
};

/** Obsidian's `right-triangle` icon. */
const triangle = (): Element => ({
  type: "element",
  tagName: "svg",
  properties: {
    xmlns: "http://www.w3.org/2000/svg",
    width: "24",
    height: "24",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: ["svg-icon", "right-triangle"],
  },
  children: [
    {
      type: "element",
      tagName: "path",
      properties: { d: "M3 8L12 17L21 8" },
      children: [],
    },
  ],
});

const indicator = (kind: "heading" | "list"): Element => ({
  type: "element",
  tagName: "span",
  properties: {
    className: [
      `${kind}-collapse-indicator`,
      "collapse-indicator",
      "collapse-icon",
    ],
    ariaHidden: "true",
  },
  children: [triangle()],
});

const hasIndicator = (el: Element): boolean =>
  el.children.some(
    (c) => c.type === "element" && classesOf(c).includes("collapse-indicator"),
  );

const isList = (c: ElementContent): boolean =>
  c.type === "element" && (c.tagName === "ul" || c.tagName === "ol");

/** A sublist in the item (tight or loose: either way the list is the item's child). */
const hasSublist = (li: Element): boolean => li.children.some(isList);

/**
 * Obsidian's fold arrows: `span.heading-collapse-indicator` opens each of the
 * note's headings, and `span.list-collapse-indicator` each list item with a
 * sublist (after its bullet, before a task's checkbox). Obsidian shows them on
 * hover where folding is on (`.allow-fold-headings`, `.allow-fold-lists` on the
 * reading view); themes restyle and move them. They do nothing by themselves:
 * a site hides them unless it folds.
 *
 * Headings: those at the top level of the note, the ones Obsidian folds
 * sections at (not those in callouts or embeds). Runs before the block
 * wrappers.
 */
export const collapseIndicators = (tree: Root): void => {
  for (const node of tree.children) {
    if (node.type !== "element" || !/^h[1-6]$/.test(node.tagName)) continue;
    if (hasIndicator(node)) continue;
    node.children.unshift(indicator("heading"));
  }
  visit(tree, "element", (node: Element) => {
    if (node.tagName !== "li" || !hasSublist(node) || hasIndicator(node))
      return;
    const first = node.children.findIndex((c) => c.type === "element");
    const bullet = node.children[first];
    const at =
      bullet?.type === "element" &&
      bullet.tagName === "span" &&
      classesOf(bullet).includes("list-bullet")
        ? first + 1
        : 0;
    node.children.splice(at, 0, indicator("list"));
  });
};
