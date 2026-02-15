import type { Element, Root } from "hast";
import { visit } from "unist-util-visit";

const isElement = (node: unknown): node is Element =>
  typeof node === "object" &&
  node !== null &&
  (node as Element).type === "element";

export const checkbox = (tree: Root) => {
  visit(tree, "element", (node: Element) => {
    if (!isElement(node) || node.tagName !== "input") return;
    if (!node.properties || node.properties.type !== "checkbox") return;

    const properties = node.properties;
    const checked = properties.checked;

    node.properties = {
      ...properties,
      checked,
      disabled: false,
      className: "checkbox-toggle",
    };
  });
};
