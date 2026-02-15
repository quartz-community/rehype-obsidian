import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

const isElement = (node: unknown): node is Element =>
  typeof node === "object" &&
  node !== null &&
  (node as Element).type === "element";

export const obsidianUri = (tree: Root) => {
  visit(tree, "element", (node: Element) => {
    if (!isElement(node) || node.tagName !== "a") return;
    if (!node.properties) return;

    const href = node.properties.href;
    if (typeof href !== "string" || !href.startsWith("obsidian://")) return;

    const className = node.properties.className;
    const classList = Array.isArray(className)
      ? className
      : typeof className === "string"
        ? [className]
        : [];

    const nextClassList = classList.includes("obsidian-uri")
      ? classList
      : [...classList, "obsidian-uri"];

    node.properties = {
      ...node.properties,
      className: nextClassList,
      dataObsidianUri: href,
    };
  });
};
