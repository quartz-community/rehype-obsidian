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

const toText = (node: ElementContent): string =>
  node.type === "text"
    ? node.value
    : node.type === "element"
      ? node.children.map(toText).join("")
      : "";

const isElement = (node: ElementContent, tag: string): node is Element =>
  node.type === "element" && node.tagName === tag;

/**
 * Obsidian's footnote markup, which themes style: a reference is
 * `sup.footnote-ref > a.footnote-link` reading `[1]`, the list is a
 * `section.footnotes` that opens with an `<hr>`, each item has
 * `data-footnote-id`, and each back-link is `a.footnote-backref.footnote-link`
 * reading `↩︎`, right after the text. An inline footnote's text (`^[…]`) is the
 * item's own, not in a paragraph. Runs after `bareFootnotes`, which renumbers
 * the references.
 *
 * The screen-reader heading GFM opens the list with (`h2.sr-only`) goes:
 * Obsidian has none, and themes' heading rules (numbering, rules above
 * headings) would count it. Its text names the section (`aria-label`), and the
 * references no longer point at it.
 */
export const footnoteMarkup = (tree: Root): void => {
  const removedLabels = new Set<string>();
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
      const [arrow] = node.children;
      if (
        node.children.length === 1 &&
        arrow?.type === "text" &&
        arrow.value === "↩"
      )
        arrow.value = "↩︎";
      return;
    }
    if (node.tagName === "section" && has(node, "dataFootnotes")) {
      const at = node.children.findIndex((c) => isElement(c, "h2"));
      if (at >= 0) {
        const heading = node.children[at] as Element;
        const label = toText(heading).trim();
        if (label) node.properties.ariaLabel = label;
        if (typeof heading.properties.id === "string")
          removedLabels.add(heading.properties.id);
        node.children.splice(at, 1);
      }
      if (!node.children.some((c) => isElement(c, "hr")))
        node.children.unshift({
          type: "element",
          tagName: "hr",
          properties: {},
          children: [],
        });
      const list = node.children.find((c): c is Element => isElement(c, "ol"));
      for (const item of list?.children ?? []) {
        if (!isElement(item, "li")) continue;
        const id = item.properties.id;
        if (typeof id === "string") item.properties.dataFootnoteId = id;
        backrefAfterText(item);
        if (typeof id === "string" && /(^|-)fn-inline-footnote-\d+$/.test(id))
          unwrapParagraph(item);
      }
    }
  });
  if (!removedLabels.size) return;
  visit(tree, "element", (node: Element) => {
    if (!has(node, "dataFootnoteRef")) return;
    const by = node.properties.ariaDescribedBy;
    const ids = (
      Array.isArray(by) ? by.map(String) : String(by ?? "").split(/\s+/)
    ).filter((id) => id && !removedLabels.has(id));
    if (ids.length) node.properties.ariaDescribedBy = ids;
    else delete node.properties.ariaDescribedBy;
  });
};

/** The item's paragraphs: GFM puts a space between the text and the back-link. */
const backrefAfterText = (item: Element): void => {
  const visitParent = (parent: Element) => {
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i]!;
      if (child.type !== "element") continue;
      if (child.tagName === "a" && has(child, "dataFootnoteBackref")) {
        const prev = parent.children[i - 1];
        if (prev?.type === "text") {
          prev.value = prev.value.replace(/\s+$/, "");
          if (!prev.value) {
            parent.children.splice(i - 1, 1);
            i--;
          }
        }
      } else if (child.tagName === "p") visitParent(child);
    }
  };
  visitParent(item);
};

/** `li > p > text`: an inline footnote's text is the item's own in Obsidian. */
const unwrapParagraph = (item: Element): void => {
  const elements = item.children.filter((c) => c.type === "element");
  const p = elements[0];
  if (elements.length !== 1 || !p || !isElement(p, "p")) return;
  item.children = p.children;
};
