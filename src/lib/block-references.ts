import type { Element, Parent, Root, Text } from "hast";
import { visit } from "unist-util-visit";

/**
 * Obsidian's identifier: `^` and letters, digits or `-`, ending the text, at its start or after
 * whitespace. `e^x`, `^a_b` and `^a.b` are text (recorded live, Obsidian 1.15.0).
 */
const blockReferenceRegex = /(?<=^|\s)\^([A-Za-z0-9-]+)$/;
const inlineTagTypes = new Set(["p", "li"]);
const blockTagTypes = new Set(["blockquote"]);
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

const applyBlockId = (
  node: Element,
  blockId: string,
  blocks: Record<string, Element>,
) => {
  if (!node.properties) {
    node.properties = {};
  }
  const slugged = blockId.toLowerCase();
  node.properties.id = slugged;
  blocks[slugged] = node;
};

const isShield = (node: Element): boolean => {
  if (shieldTypes.has(node.tagName)) return true;
  const className: unknown = node.properties?.className;
  const classes: string[] = Array.isArray(className)
    ? className.map(String)
    : typeof className === "string"
      ? className.split(/\s+/)
      : [];
  return classes.some((name) => /^(?:katex|math|MathJax)/.test(name));
};

/**
 * Strip an identifier from every inline text node under `node` that ends in one, except
 * `skip`, and return the last identifier found.
 *
 * Obsidian strips each one, not only the block's last: `x **^blk** y` renders
 * `x <strong></strong> y`, and `x **^blk** ^two` empties the strong and drops `^two`, while only
 * the last (`two`) names the block. The whitespace before the `^` stays.
 */
const stripInlineIds = (
  node: Element,
  skip?: Text,
): string | undefined => {
  let last: string | undefined;
  const emptied = new Set<Text>();
  const walk = (parent: Element) => {
    for (const child of parent.children) {
      if (isText(child)) {
        if (child === skip) continue;
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

export const blockReferences = (tree: Root, file: VFileLike) => {
  const data = ensureFileData(file);
  const blocks = data.blocks;

  visit(
    tree,
    "element",
    (node: Element, index: number | undefined, parent: Parent | undefined) => {
      if (!isElement(node)) return;

      if (blockTagTypes.has(node.tagName)) {
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

  data.htmlAst = tree;
};
