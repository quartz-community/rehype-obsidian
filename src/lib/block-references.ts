import type { Element, Parent, Root, Text } from "hast";
import { visit } from "unist-util-visit";

/**
 * Obsidian's identifier: `^` and letters, digits or `-`, ending the text, at its start or after
 * whitespace. `e^x`, `^a_b` and `^a.b` are text (recorded live, Obsidian 1.15.0).
 */
const blockReferenceRegex = /(?<=^|\s)\^([A-Za-z0-9-]+)$/;
const inlineTagTypes = new Set(["p", "li"]);
const blockTagTypes = new Set(["blockquote"]);
/** Callouts render as <div class="callout">, like in Obsidian; they are blocks too. */
const isBlockElement = (node: Element) =>
  blockTagTypes.has(node.tagName) ||
  (node.tagName === "div" &&
    Array.isArray(node.properties?.className) &&
    (node.properties.className as unknown[]).includes("callout"));
const cellTagTypes = new Set(["td", "th"]);
/** Blocks inside a block, read on their own visit rather than as its inline content. */
const nestedBlockTypes = new Set([
  "p",
  "ul",
  "ol",
  "li",
  "blockquote",
  "table",
  "div",
  "section",
  "pre",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
]);
/** Elements whose text is never an identifier: code, and rendered math. */
const shieldTypes = new Set([
  "code",
  "pre",
  "math",
  "svg",
  "annotation",
  "script",
  "style",
]);

type VFileData = {
  blocks: Record<string, Element>;
  htmlAst?: Root;
} & Record<string, unknown>;

type VFileLike = { data?: Record<string, unknown> };

const isElement = (node: unknown): node is Element =>
  typeof node === "object" &&
  node !== null &&
  (node as Element).type === "element";

const isText = (node: unknown): node is Text =>
  typeof node === "object" && node !== null && (node as Text).type === "text";

const isParent = (node: unknown): node is Parent =>
  typeof node === "object" &&
  node !== null &&
  Array.isArray((node as Parent).children);

const ensureFileData = (file: VFileLike): VFileData => {
  if (!file.data) {
    file.data = {};
  }

  const data = file.data as VFileData;
  if (!data.blocks) {
    data.blocks = {};
  }

  return data;
};

/**
 * The id of the block `^name`: `^name`, lowercased. Blocks and headings are separate namespaces,
 * as in Obsidian, so block `^para-1` and heading `## Para 1` (`para-1`) don't share an id; links
 * to the block are `#^para-1`. `file.data.blocks` is keyed by the bare name (`para-1`).
 */
export const blockElementId = (name: string) => `^${name.toLowerCase()}`;

const applyBlockId = (
  node: Element,
  blockId: string,
  blocks: Record<string, Element>,
) => {
  if (!node.properties) {
    node.properties = {};
  }
  const slugged = blockId.toLowerCase();
  node.properties.id = blockElementId(slugged);
  blocks[slugged] = node;
};

/**
 * A link rendered from a wikilink carries this property (`data-wikilink`). Its text is the link's
 * target or alias, never a block identifier: Obsidian renders `[[n#^id]]` as `n > ^id` and
 * `[[n|a ^id]]` as `a ^id`, and gives the paragraph no identifier. A Markdown link's text is
 * read like any other: `[a ^id](n)` renders `a ` and names the paragraph (Obsidian 1.15.0).
 */
export const WIKILINK_PROPERTY = "dataWikilink";

const isShield = (node: Element): boolean => {
  if (shieldTypes.has(node.tagName)) return true;
  const wikilink: unknown = node.properties?.[WIKILINK_PROPERTY];
  if (
    node.tagName === "a" &&
    wikilink !== undefined &&
    wikilink !== null &&
    wikilink !== false
  )
    return true;
  const className: unknown = node.properties?.className;
  const classes: string[] = Array.isArray(className)
    ? className.map(String)
    : typeof className === "string"
      ? className.split(/\s+/)
      : [];
  return classes.some((name) => /^(?:katex|math|MathJax)/.test(name));
};

/**
 * Strip an identifier from every inline text node under `node` that ends in one and ends its
 * parent, except `skip`, and return the last identifier found.
 *
 * Obsidian strips each one, not only the block's last: `x **^blk** y` renders
 * `x <strong></strong> y`, and `x **^blk** ^two` empties the strong and drops `^two`, while only
 * the last (`two`) names the block. The whitespace before the `^` stays.
 */
const stripInlineIds = (node: Element, skip?: Text): string | undefined => {
  let last: string | undefined;
  const emptied = new Set<Text>();
  const walk = (parent: Element) => {
    for (const child of parent.children) {
      if (isText(child)) {
        if (child === skip) continue;
        // Only text ending its parent: `| ^blk[[w]] |`, `| x ^blk *y* |` and
        // `==a ^blk [[w]]==` keep their `^blk`, where `==a ^blk== b` strips it (Obsidian
        // 1.15.0, found by remark-obsidian's differential fuzz).
        if (parent.children[parent.children.length - 1] !== child) continue;
        const match = child.value.match(blockReferenceRegex);
        if (!match) continue;
        child.value = child.value.slice(0, match.index);
        last = match[1];
        if (child.value === "") emptied.add(child);
      } else if (
        isElement(child) &&
        !nestedBlockTypes.has(child.tagName) &&
        !isShield(child)
      ) {
        walk(child);
      }
    }
    // An emptied text goes, so `**^blk**` leaves an empty `strong`, as Obsidian renders it.
    if (emptied.size > 0) {
      parent.children = parent.children.filter(
        (child) => !isText(child) || !emptied.has(child),
      );
    }
  };
  walk(node);
  return last;
};

/**
 * The block a same-page link names, `#^id` (percent-encoded or not, as Markdown links and
 * wikilinks write it), or `undefined` for any other link.
 */
const linkedBlockId = (href: string): string | undefined => {
  if (!href.startsWith("#")) return undefined;
  let anchor = href.slice(1);
  try {
    anchor = decodeURIComponent(anchor);
  } catch {
    // not percent-encoding: read as written
  }
  return anchor.startsWith("^") ? anchor.slice(1).toLowerCase() : undefined;
};

/**
 * Point same-page block links (`[x](#^id)`, `[[#^id]]`) at the block's id, as Obsidian follows
 * them. The ids are given here, after heading-id plugins resolved same-page anchors
 * (github-flavored-markdown#12), so no earlier pass could find them.
 */
const resolveBlockLinks = (tree: Root, blocks: Record<string, Element>) => {
  visit(tree, "element", (node: Element) => {
    if (node.tagName !== "a") return;
    const href = node.properties?.href;
    if (typeof href !== "string") return;
    const id = linkedBlockId(href);
    if (id !== undefined && Object.hasOwn(blocks, id))
      node.properties.href = `#${blockElementId(id)}`;
  });
};

export const blockReferences = (tree: Root, file: VFileLike) => {
  const data = ensureFileData(file);
  const blocks = data.blocks;

  visit(
    tree,
    "element",
    (node: Element, index: number | undefined, parent: Parent | undefined) => {
      if (!isElement(node)) return;

      if (isBlockElement(node)) {
        if (!isParent(parent) || typeof index !== "number") return;
        const siblingIndex = index + 2;
        const sibling = parent.children[siblingIndex];
        if (!isElement(sibling) || sibling.tagName !== "p") return;

        const firstChild = sibling.children[0];
        if (!isText(firstChild)) return;

        const match = firstChild.value.match(blockReferenceRegex);
        if (!match) return;

        const blockId = match[1];
        parent.children.splice(siblingIndex, 1);
        applyBlockId(node, blockId, blocks);
        return;
      }

      // A table cell's identifier names the table, as Obsidian registers it.
      if (node.tagName === "table") {
        let last: string | undefined;
        visit(node, "element", (cell: Element) => {
          if (!cellTagTypes.has(cell.tagName)) return;
          last = stripInlineIds(cell) ?? last;
        });
        if (last) applyBlockId(node, last, blocks);
        return;
      }

      if (!inlineTagTypes.has(node.tagName)) return;

      const children = node.children;
      if (!children || children.length === 0) return;

      const lastChild = children[children.length - 1];
      const tail = isText(lastChild) ? lastChild : undefined;
      // Identifiers inside wrappers and earlier text first; the block's own last text, handled
      // below, comes last and so wins when it holds one.
      const inner = stripInlineIds(node, tail);
      const match = tail?.value.match(blockReferenceRegex);
      if (!tail || !match) {
        if (inner) applyBlockId(node, inner, blocks);
        return;
      }

      const blockId = match[1];
      const stripped = tail.value.replace(blockReferenceRegex, "").trimEnd();

      // A paragraph that held nothing else names the block before it. One with more in it,
      // `x **^blk** ^two`, keeps the identifier for itself.
      if (stripped.length === 0 && children.length > 1) {
        children.pop();
        applyBlockId(node, blockId, blocks);
        return;
      }

      if (stripped.length === 0) {
        children.pop();

        if (isParent(parent)) {
          for (let i = (index ?? 0) - 1; i >= 0; i -= 1) {
            const sibling = parent.children[i];
            if (isElement(sibling)) {
              applyBlockId(sibling, blockId, blocks);
              // The emptied paragraph goes, as the quote's does: Obsidian renders none.
              if (node.tagName === "p" && typeof index === "number") {
                parent.children.splice(index, 1);
                return index;
              }
              return;
            }
          }
        }

        applyBlockId(node, blockId, blocks);
        return;
      }

      tail.value = stripped;
      applyBlockId(node, blockId, blocks);
    },
  );

  resolveBlockLinks(tree, blocks);

  data.htmlAst = tree;
};
