import type { Element, Root, RootContent } from "hast";
import { visit } from "unist-util-visit";

/**
 * Element `remark-obsidian` renders a kept `%%` comment as. Keeping the comment in
 * the mdast tree is what lets a consumer see where comments are, but it must not
 * reach the page, so the node carries `data.hChildren: []` and arrives here as an
 * empty element rather than as its own text.
 */
export const COMMENT_ELEMENT = "obsidian-comment";

const isCommentElement = (node: RootContent): node is Element =>
  node.type === "element" && (node as Element).tagName === COMMENT_ELEMENT;

export const stripComments = (tree: Root): void => {
  visit(tree, (node, index, parent) => {
    if (!parent || typeof index !== "number") return;
    if (!isCommentElement(parent.children[index] as RootContent)) return;
    parent.children.splice(index, 1);
    return index;
  });
};
