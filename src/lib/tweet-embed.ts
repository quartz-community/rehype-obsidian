import type { Element, Parent, Root } from "hast";
import { visit } from "unist-util-visit";

const tweetRegex =
  /^https:\/\/(twitter\.com|x\.com|mobile\.twitter\.com)\/([^/]+)\/status\/(\d+)$/;

const isElement = (node: unknown): node is Element =>
  typeof node === "object" &&
  node !== null &&
  (node as Element).type === "element";

const isParent = (node: unknown): node is Parent =>
  typeof node === "object" &&
  node !== null &&
  Array.isArray((node as Parent).children);

export const tweetEmbed = (tree: Root) => {
  visit(
    tree,
    "element",
    (node: Element, index: number | undefined, parent: Parent | undefined) => {
      if (!isElement(node) || node.tagName !== "img") return;
      if (!node.properties) return;

      const src = node.properties.src;
      if (typeof src !== "string") return;

      const match = src.match(tweetRegex);
      const user = match?.[2];
      const statusId = match?.[3];
      if (!user || !statusId) return;

      const blockquote: Element = {
        type: "element",
        tagName: "blockquote",
        properties: {
          className: ["external-embed", "twitter"],
        },
        children: [
          {
            type: "element",
            tagName: "a",
            properties: { href: src },
            children: [{ type: "text", value: `Tweet by @${user}` }],
          },
        ],
      };

      if (!isParent(parent) || typeof index !== "number") return;
      parent.children[index] = blockquote;
    },
  );
};
