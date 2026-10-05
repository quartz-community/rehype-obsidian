import type { Element, Root, Text } from "hast";
import { visit } from "unist-util-visit";

/**
 * The twelve pictographs Obsidian 1.14 reads as a highlight's colour, and the
 * `data-highlight` value each one produces.
 *
 * Six colours, each written either as a circle or as a square. The set is
 * closed rather than sampled: both families were probed in full and the mapping
 * read back out of Obsidian's own rendered HTML, where `==🔴 text==` becomes
 * `<mark data-highlight="red"> text</mark>`. Brown, black and white are not
 * markers in either family and stay in the content.
 */
const COLOURS = new Map<number, string>([
  [0x1f534, "red"],
  [0x1f7e5, "red"],
  [0x1f7e0, "orange"],
  [0x1f7e7, "orange"],
  [0x1f7e1, "yellow"],
  [0x1f7e8, "yellow"],
  [0x1f7e2, "green"],
  [0x1f7e9, "green"],
  [0x1f535, "blue"],
  [0x1f7e6, "blue"],
  [0x1f7e3, "purple"],
  [0x1f7ea, "purple"],
]);

/**
 * Colour a highlight from its leading emoji, as Obsidian 1.14 does.
 *
 * This is the rendering half of a change `remark-obsidian` deliberately keeps
 * out of the tree. Obsidian *consumes* the emoji -- it leaves both the rendered
 * text and the highlight's content -- but the file on disk still holds it, so
 * dropping it from a node value would let a formatter delete the author's
 * character. The mdast therefore keeps the whole content and the marker is
 * removed here, where it becomes output, exactly as a dangling footnote
 * reference is bared here rather than flattened upstream.
 *
 * Three details are measured rather than assumed:
 *
 * - The strip is by **codepoint**, not grapheme. `==🔴\uFE0F text==` consumes
 *   the circle and leaves the variation selector orphaned at the front of the
 *   content, so a grapheme-aware strip would swallow a character Obsidian keeps.
 * - Only a **leading** marker counts, and only the **first**: the inner `🟢` of
 *   `==🔴 a ==🟢 b==` survives as text.
 * - Whatever followed the marker stays, including a space, a tab or a line
 *   ending. The marker is removed, not the separator -- Obsidian renders
 *   `<mark data-highlight="red"> a ==🟢 b</mark>` with its leading space intact.
 *
 * A marker does not rescue a highlight that would not form anyway, which needs
 * no code here: `== 🔴 text==` never became a `mark` to begin with.
 */
export const colouredHighlights = (tree: Root): void => {
  visit(tree, "element", (node: Element) => {
    if (node.tagName !== "mark") return;
    const [first] = node.children;
    if (!first || first.type !== "text") return;

    const text = first as Text;
    const marker = text.value.codePointAt(0);
    if (marker === undefined) return;
    const colour = COLOURS.get(marker);
    if (colour === undefined) return;

    text.value = text.value.slice(String.fromCodePoint(marker).length);
    node.properties ??= {};
    node.properties.dataHighlight = colour;
  });
};
