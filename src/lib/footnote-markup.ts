import type { Element, ElementContent, Root } from "hast";
import { visit } from "unist-util-visit";

/** Presence, not `true`: `rehype-raw` turns boolean attributes into "". */
const has = (node: Element, prop: string): boolean => {
  const v = node.properties?.[prop];
  return v !== undefined && v !== null && v !== false;
};

const addClass = (node: Element, ...names: string[]): void => {
  const cur: unknown = node.properties.className;
  const list = Array.isArray(cur)
    ? cur.map(String)
    : typeof cur === "string"
      ? cur.split(/\s+/).filter(Boolean)
      : [];
  for (const n of names) if (!list.includes(n)) list.push(n);
  node.properties.className = list;
};

const isElement = (node: ElementContent, tag: string): node is Element =>
  node.type === "element" && node.tagName === tag;

/**
 * Obsidian's footnote markup, which themes style: a reference is
 * `sup.footnote-ref > a.footnote-link` reading `[1]`, the list is a
 * `section.footnotes` that opens with an `<hr>`, and each back-link is
 * `a.footnote-backref.footnote-link`. Runs after `bareFootnotes`, which
 * renumbers the references.
 */
export const footnoteMarkup = (tree: Root): void => {
  visit(tree, "element", (node: Element) => {
    if (node.tagName === "sup") {
      const anchor = node.children.find(
        (c): c is Element => isElement(c, "a") && has(c, "dataFootnoteRef"),
      );
      if (!anchor) return;
      addClass(node, "footnote-ref");
      addClass(anchor, "footnote-link");
      const [label] = anchor.children;
      if (
        anchor.children.length === 1 &&
        label?.type === "text" &&
        /^\d+$/.test(label.value)
      )
        label.value = `[${label.value}]`;
      return;
    }
    if (node.tagName === "a" && has(node, "dataFootnoteBackref")) {
      addClass(node, "footnote-backref", "footnote-link");
      return;
    }
    if (node.tagName === "section" && has(node, "dataFootnotes")) {
      if (node.children.some((c) => isElement(c, "hr"))) return;
      // After the screen-reader heading, so the rule is the first thing seen.
      const heading = node.children.findIndex((c) => isElement(c, "h2"));
      const hr: Element = {
        type: "element",
        tagName: "hr",
        properties: {},
        children: [],
      };
      node.children.splice(heading + 1, 0, hr);
    }
  });
};
