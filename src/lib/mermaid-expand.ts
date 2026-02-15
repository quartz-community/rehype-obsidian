import type { Element, Parent, Root } from "hast";
import { visit } from "unist-util-visit";

const isElement = (node: unknown): node is Element =>
  typeof node === "object" &&
  node !== null &&
  (node as Element).type === "element";

const isParent = (node: unknown): node is Parent =>
  typeof node === "object" &&
  node !== null &&
  Array.isArray((node as Parent).children);

const hasClassName = (node: Element, className: string) => {
  const classes = node.properties?.className;
  if (Array.isArray(classes)) {
    return classes.includes(className);
  }
  if (typeof classes === "string") {
    return classes.split(/\s+/).includes(className);
  }
  return false;
};

const expandButton = (): Element => ({
  type: "element",
  tagName: "button",
  properties: {
    className: ["expand-button"],
    "aria-label": "Expand mermaid diagram",
    "data-view-component": true,
  },
  children: [
    {
      type: "element",
      tagName: "svg",
      properties: {
        width: 16,
        height: 16,
        viewBox: "0 0 16 16",
        fill: "currentColor",
      },
      children: [
        {
          type: "element",
          tagName: "path",
          properties: {
            d: "M3.72 3.72a.75.75 0 011.06 1.06L2.56 7h10.88l-2.22-2.22a.75.75 0 011.06-1.06l3.5 3.5a.75.75 0 010 1.06l-3.5 3.5a.75.75 0 11-1.06-1.06l2.22-2.22H2.56l2.22 2.22a.75.75 0 11-1.06 1.06l-3.5-3.5a.75.75 0 010-1.06l3.5-3.5z",
          },
          children: [],
        },
      ],
    },
  ],
});

const mermaidContainer = (): Element => ({
  type: "element",
  tagName: "div",
  properties: { id: "mermaid-container", role: "dialog" },
  children: [
    {
      type: "element",
      tagName: "div",
      properties: { id: "mermaid-space" },
      children: [
        {
          type: "element",
          tagName: "div",
          properties: { className: ["mermaid-content"] },
          children: [],
        },
      ],
    },
  ],
});

export const mermaidExpand = (tree: Root) => {
  visit(
    tree,
    "element",
    (node: Element, _index: number | undefined, parent: Parent | undefined) => {
      if (!isElement(node) || node.tagName !== "code") return;
      if (!hasClassName(node, "mermaid")) return;
      if (!isParent(parent)) return;

      parent.children = [expandButton(), node, mermaidContainer()];
    },
  );
};
