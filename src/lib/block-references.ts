import type { Element, Parent, Root, Text } from "hast";
import { visit } from "unist-util-visit";

const blockReferenceRegex = /\^([-_A-Za-z0-9]+)$/;
const inlineTagTypes = new Set(["p", "li"]);
const blockTagTypes = new Set(["blockquote"]);

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
  node.properties.id = blockId;
  blocks[blockId] = node;
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

      if (!inlineTagTypes.has(node.tagName)) return;

      const children = node.children;
      if (!children || children.length === 0) return;

      const lastChild = children[children.length - 1];
      if (!isText(lastChild)) return;

      const match = lastChild.value.match(blockReferenceRegex);
      if (!match) return;

      const blockId = match[1];
      const stripped = lastChild.value
        .replace(blockReferenceRegex, "")
        .trimEnd();

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

      lastChild.value = stripped;
      applyBlockId(node, blockId, blocks);
    },
  );

  data.htmlAst = tree;
};
