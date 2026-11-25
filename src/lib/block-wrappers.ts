import type { Element, ElementContent, Root, RootContent } from "hast";

const classesOf = (el: Element): string[] => {
  const c = el.properties.className;
  return Array.isArray(c) ? c.map(String) : c ? String(c).split(/\s+/) : [];
};

/** A block wrapper (`div.el-p`), as made here or by Obsidian. */
export const isBlockWrapper = (
  node: RootContent | ElementContent,
): node is Element =>
  node.type === "element" &&
  node.tagName === "div" &&
  classesOf(node).some((c) => /^el-[a-z0-9]+$/.test(c));

const isEmptyParagraph = (node: RootContent): boolean =>
  node.type === "element" &&
  node.tagName === "p" &&
  node.children.every((c) => c.type === "text" && !c.value.trim());

const isTransclude = (el: Element): boolean =>
  classesOf(el).includes("transclude");

/**
 * The block Obsidian names the wrapper after (`div.el-<block>`), for Quartz's
 * markup of the same block where it differs from Obsidian's.
 */
const blockName = (el: Element): string => {
  const classes = classesOf(el);
  // Code blocks: `<figure>` from syntax highlighting, `<pre>` in Obsidian.
  if (
    el.tagName === "figure" &&
    (el.properties.dataRehypePrettyCodeFigure !== undefined ||
      el.children.some((c) => c.type === "element" && c.tagName === "pre"))
  )
    return "pre";
  // Diagrams: Obsidian renders ```mermaid in `div.el-pre > div.mermaid`.
  if (classes.includes("mermaid-diagram") || classes.includes("mermaid"))
    return "pre";
  // Display maths: `div.el-div > div.math.math-block` in Obsidian.
  if (classes.some((c) => /^(math-display|katex-display)$/.test(c)))
    return "div";
  // A note embed is a paragraph's in Obsidian (`div.el-p > p > span.internal-embed`).
  if (isTransclude(el)) return "p";
  return el.tagName.toLowerCase();
};

const wrapper = (name: string, children: ElementContent[]): Element => ({
  type: "element",
  tagName: "div",
  properties: { className: [`el-${name}`] },
  children,
});

/**
 * Obsidian's reading view wraps each of the note's top-level blocks in a div
 * named after it (`div.el-p > p`, `div.el-h2 > h2`, `div.el-pre > pre`), and
 * themes style those wrappers: their padding and margins space the blocks, and
 * `:first-child` / `:last-child` match each block in its own wrapper. Quartz
 * renders the same wrappers around the note's top-level blocks. They have no
 * styles of their own, so Quartz's look doesn't change.
 *
 * Runs last, after the steps that reshape top-level blocks. A tree whose
 * blocks are all wrapped already is left alone.
 */
export const blockWrappers = (tree: Root): void => {
  const elements = tree.children.filter((c) => c.type === "element");
  if (elements.length && elements.every(isBlockWrapper)) return;
  const out: RootContent[] = [];
  for (let i = 0; i < tree.children.length; i++) {
    const node = tree.children[i]!;
    if (node.type !== "element") {
      out.push(node);
      continue;
    }
    // `![[note]]`: the parser splits the embed's div out of its paragraph
    // (`<p></p><div class="transclude">`); both go in the paragraph's wrapper.
    if (isEmptyParagraph(node)) {
      let j = i + 1;
      while (
        j < tree.children.length &&
        tree.children[j]!.type === "text" &&
        !(tree.children[j] as { value: string }).value.trim()
      )
        j++;
      const next = tree.children[j];
      if (next?.type === "element" && isTransclude(next)) {
        out.push(
          wrapper("p", tree.children.slice(i, j + 1) as ElementContent[]),
        );
        i = j;
        continue;
      }
    }
    out.push(wrapper(blockName(node), [node]));
  }
  tree.children = out;
};
