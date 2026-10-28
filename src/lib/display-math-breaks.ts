import type { Element, Root, RootContent } from "hast";
import { visit } from "unist-util-visit";

const classesOf = (node: Element): string[] => {
  const className: unknown = node.properties?.className;
  if (Array.isArray(className)) return className.map(String);
  return typeof className === "string" ? className.split(/\s+/) : [];
};

/** Display math as `remark-obsidian`, KaTeX or MathJax render it. */
const isDisplayMath = (node: RootContent | undefined): boolean => {
  if (node?.type !== "element") return false;
  if (node.tagName === "mjx-container") {
    return String(node.properties?.display) === "true";
  }
  return classesOf(node).some(
    (name) => name === "math-display" || name === "katex-display",
  );
};

/**
 * Drop the line break straight after display math inside a paragraph.
 *
 * Obsidian renders `a $$y^2$$` over `b` as the formula's block and then `b`, with no `<br>`
 * between: the formula is a block, so the line ending after it adds nothing (recorded against
 * Obsidian 1.15.0, in a paragraph, a list item and a quote). `remark-obsidian`'s `legacy`
 * preset keeps the line ending as a `break`, since the source holds one, which rendered as an
 * empty line under the formula.
 */
export const displayMathBreaks = (tree: Root): void => {
  visit(tree, "element", (node: Element) => {
    if (node.tagName !== "p") return;
    const children = node.children;
    for (let index = 0; index < children.length; index += 1) {
      if (!isDisplayMath(children[index])) continue;
      let next = index + 1;
      while (
        children[next]?.type === "text" &&
        /^[ \t]*$/.test((children[next] as { value: string }).value)
      ) {
        next += 1;
      }
      const candidate = children[next];
      if (candidate?.type === "element" && candidate.tagName === "br") {
        children.splice(next, 1);
      }
    }
  });
};
