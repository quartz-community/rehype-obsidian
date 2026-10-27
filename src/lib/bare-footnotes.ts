import type { Element, Root, RootContent, Text } from "hast";
import { visit } from "unist-util-visit";

/**
 * `mdast-util-to-hast` builds a reference's target as
 * `${clobberPrefix}fn-${id}`, with `user-content-` as the default prefix.
 * Dropping a known prefix first keeps an identifier that itself contains
 * `fn-` intact.
 */
const identifierFrom = (href: string): string =>
  href
    .replace(/^#/, "")
    .replace(/^user-content-/, "")
    .replace(/^fn-/, "");

/**
 * Presence, not a strict `true`: `mdast-util-to-hast` sets the boolean, but
 * `rehype-raw` re-parses the tree through HTML on the way here and a bare
 * attribute comes back as the empty string.
 */
const isFootnoteAnchor = (node: RootContent): node is Element => {
  if (node.type !== "element" || node.tagName !== "a") return false;
  const marker = node.properties?.dataFootnoteRef;
  return marker !== undefined && marker !== null && marker !== false;
};

/**
 * Render a footnote reference nothing defines as its bare label.
 *
 * `remark-obsidian` keeps an undefined `[^x]` as a real `footnoteReference`,
 * because flattening it in the tree would let a formatter write `x` back over
 * `[^x]` and destroy a reference the author had merely not defined yet. That
 * leaves the drop to the renderer: `mdast-util-to-hast` turns every reference
 * into `<sup><a href="#user-content-fn-x">`, which for an undefined one is a
 * numbered link to a target that was never emitted. Obsidian shows the bare
 * label instead, so the marker is replaced here, where it becomes output.
 *
 * The anchor's own text is the ordinal the renderer assigned, not the label,
 * so the name comes from the target it fails to reach.
 */
export const bareFootnotes = (tree: Root): void => {
  const present = new Set<string>();
  visit(tree, "element", (node: Element) => {
    const id = node.properties?.id;
    if (typeof id === "string") present.add(id);
  });

  visit(tree, "element", (node: Element, index, parent) => {
    if (!parent || typeof index !== "number") return;
    if (node.tagName !== "sup") return;

    const anchor = node.children.find(isFootnoteAnchor);
    const href = anchor?.properties?.href;
    if (!anchor || typeof href !== "string" || !href.startsWith("#")) return;
    if (present.has(href.slice(1))) return;

    const bare: Text = { type: "text", value: identifierFrom(href) };
    parent.children.splice(index, 1, bare);
    return index;
  });

  bareSplitAnchors(tree, present);
  renumber(tree);
};

/**
 * Bare a reference whose marker an HTML parser split out of a link.
 *
 * A reference inside link text (`[link [^x]](url)`) renders as an anchor inside
 * an anchor, which HTML cannot nest. When `rehype-raw` re-parses the tree on the
 * way here, the parser closes the link at the inner `<a>`: the link keeps an
 * empty `<sup>` as its last child and the reference's anchor follows it as a
 * sibling, outside any `sup`, so the pass above never sees it. Obsidian renders
 * a defined reference split the same way, which is left alone. An undefined one
 * shows its bare label where the reference stood, so the label takes the empty
 * `sup`'s place inside the link -- where it lands without `rehype-raw` -- and the
 * stray anchor goes.
 */
const bareSplitAnchors = (tree: Root, present: ReadonlySet<string>): void => {
  visit(tree, "element", (node: Element, index, parent) => {
    if (!parent || typeof index !== "number") return;
    if (!isFootnoteAnchor(node)) return;
    if (parent.type === "element" && parent.tagName === "sup") return;
    const href = node.properties?.href;
    if (typeof href !== "string" || !href.startsWith("#")) return;
    if (present.has(href.slice(1))) return;

    const bare: Text = { type: "text", value: identifierFrom(href) };
    const link = parent.children[index - 1];
    const last =
      link?.type === "element" && link.tagName === "a"
        ? link.children[link.children.length - 1]
        : undefined;
    if (
      link?.type === "element" &&
      last?.type === "element" &&
      last.tagName === "sup" &&
      last.children.length === 0
    ) {
      link.children.splice(link.children.length - 1, 1, bare);
      parent.children.splice(index, 1);
      return index;
    }
    parent.children.splice(index, 1, bare);
    return index;
  });
};

/**
 * Close the gaps the removed markers left in the numbering.
 *
 * `mdast-util-to-hast` numbers references as it meets them, so one that is
 * about to be bared still consumes an ordinal: with `[^a]` undefined and
 * `[^b]` defined, the surviving marker renders as `2` where Obsidian shows
 * `1`. Numbering by first appearance of each target reproduces the original
 * rule on what is left, so repeated references to one definition keep sharing
 * a number.
 */
const renumber = (tree: Root): void => {
  const ordinals = new Map<string, number>();
  visit(tree, "element", (node: Element) => {
    if (!isFootnoteAnchor(node)) return;
    const href = node.properties?.href;
    if (typeof href !== "string") return;
    const ordinal = ordinals.get(href) ?? ordinals.size + 1;
    ordinals.set(href, ordinal);
    const label = node.children.find((child) => child.type === "text");
    if (label) (label as Text).value = String(ordinal);
  });
};
