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

  visit(tree, "element", (node: Element) => {
    if (!isElement(node) || node.tagName !== "li") return;
    if (!node.properties) return;

    const className = node.properties.className;
    const classList = Array.isArray(className)
      ? className
      : typeof className === "string"
        ? [className]
        : [];

    if (!classList.includes("task-list-item")) return;

    const checkboxInput = node.children.find(
      (child): child is Element =>
        isElement(child) &&
        child.tagName === "input" &&
        child.properties?.type === "checkbox",
    );

    if (!checkboxInput) return;

    const checked = Boolean(checkboxInput.properties?.checked);
    const taskChar =
      typeof node.properties.dataTaskChar === "string"
        ? node.properties.dataTaskChar
        : checked
          ? "x"
          : "";
    const nextClassList =
      checked && !classList.includes("is-checked")
        ? [...classList, "is-checked"]
        : classList;

    node.properties = {
      ...node.properties,
      className: nextClassList,
      dataTask: taskChar,
    };
    // Clean up the intermediate property — only data-task should remain
    delete node.properties.dataTaskChar;
  });
};
