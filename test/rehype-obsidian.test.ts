import type { Element, ElementContent, Root, Text } from "hast";
import rehypeParse from "rehype-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import rehypeObsidian, { type RehypeObsidianOptions } from "../src/index.js";

const process = async (html: string, opts?: RehypeObsidianOptions) => {
  const processor = unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeObsidian, opts);

  return (await processor.run(processor.parse(html))) as Root;
};

const findFirstElement = (tree: Root, tagName: string): Element | undefined => {
  let found: Element | undefined;

  const walk = (node: Root | Element) => {
    if (found) return;
    if (node.type === "element" && node.tagName === tagName) {
      found = node;
      return;
    }
    if ("children" in node) {
      for (const child of node.children) {
        if (child.type === "element") {
          walk(child);
          if (found) return;
        }
      }
    }
  };

  walk(tree);
  return found;
};

const findElements = (tree: Root, tagName: string): Element[] => {
  const found: Element[] = [];

  const walk = (node: Root | Element) => {
    if (node.type === "element" && node.tagName === tagName) {
      found.push(node);
    }
    if ("children" in node) {
      for (const child of node.children) {
        if (child.type === "element") {
          walk(child);
        }
      }
    }
  };

  walk(tree);
  return found;
};

const getClasses = (el: Element): string[] =>
  Array.isArray(el.properties?.className)
    ? (el.properties.className as string[])
    : typeof el.properties?.className === "string"
    ? [el.properties.className]
    : [];

describe("rehype-obsidian", () => {
  it("handles block references on paragraphs", async () => {
    const tree = await process("<p>Some text ^blockId</p>");
    const paragraph = findFirstElement(tree, "p");

    expect(paragraph?.properties?.id).toBe("blockid");

    if (!paragraph) throw new Error("Paragraph not found");
    const textChild = paragraph.children.find(
      (child): child is Text => child.type === "text"
    );
    expect(textChild?.value).toBe("Some text");
  });

  it("lowercases mixed-case block reference IDs", async () => {
    const tree = await process("<p>Content ^CB-A34B78B4ICqt6zX6xBDAh6CT</p>");
    const paragraph = findFirstElement(tree, "p");

    expect(paragraph?.properties?.id).toBe("cb-a34b78b4icqt6zx6xbdah6ct");
  });

  // Recorded live against Obsidian 1.15.0: every inline text ending in an identifier is
  // stripped, and the last one names the block.
  it("strips a block reference inside emphasis", async () => {
    const tree = await process("<p>x <strong>^blk</strong> y</p>");
    const paragraph = findFirstElement(tree, "p");
    expect(paragraph?.properties?.id).toBe("blk");
    expect(findFirstElement(tree, "strong")?.children).toEqual([]);
  });

  it("names the block by the last of several block references", async () => {
    const tree = await process("<p>x <strong>^blk</strong> y ^two</p>");
    const paragraph = findFirstElement(tree, "p");
    expect(paragraph?.properties?.id).toBe("two");
    expect(findFirstElement(tree, "strong")?.children).toEqual([]);
    const texts = paragraph?.children.filter(
      (child): child is Text => child.type === "text"
    );
    expect(texts?.map((t) => t.value).join("|")).toBe("x | y");
  });

  it("keeps a trailing block reference on its own paragraph", async () => {
    const tree = await process(
      '<ul><li>a</li></ul><p>x <a href="u">l</a> ^blk</p>'
    );
    expect(findFirstElement(tree, "p")?.properties?.id).toBe("blk");
    expect(findFirstElement(tree, "ul")?.properties?.id).toBeUndefined();
  });

  it("gives a table cell's block reference to the table", async () => {
    const tree = await process(
      "<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>a ^blk</td></tr></tbody></table>"
    );
    expect(findFirstElement(tree, "table")?.properties?.id).toBe("blk");
    const cell = findFirstElement(tree, "td");
    expect((cell?.children[0] as Text).value).toBe("a ");
  });

  it("reads only Obsidian's block reference characters", async () => {
    for (const html of [
      "<p>x e^x</p>",
      "<p>x ^a_b</p>",
      "<p>x ^a.b</p>",
      "<p>x <code>^blk</code></p>",
    ]) {
      const tree = await process(html);
      expect(findFirstElement(tree, "p")?.properties?.id, html).toBeUndefined();
    }
  });

  it("drops the line break after display math in a paragraph", async () => {
    const tree = await process(
      '<p>a <code class="language-math math-display">y^2</code><br>\nb</p>'
    );
    expect(findElements(tree, "br")).toHaveLength(0);
    const kept = await process(
      '<p>a <code class="language-math math-inline">y</code><br>\nb</p>'
    );
    expect(findElements(kept, "br")).toHaveLength(1);
  });

  it("replaces YouTube images with embeds", async () => {
    const tree = await process(
      '<img src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />'
    );
    const iframe = findFirstElement(tree, "iframe");

    expect(iframe).toBeDefined();
    expect(iframe?.properties?.src).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
  });

  it("falls back to link blockquote for unavailable tweets", async () => {
    const tree = await process(
      '<img src="https://twitter.com/user/status/1234567890123456789" />' +
        '<img src="https://x.com/another/status/9876543210987654321" />'
    );
    const blockquotes = findElements(tree, "blockquote");

    expect(blockquotes).toHaveLength(2);

    const [first, second] = blockquotes;
    expect(getClasses(first)).toContain("external-embed");
    expect(getClasses(first)).toContain("twitter");
    expect(getClasses(second)).toContain("external-embed");
    expect(getClasses(second)).toContain("twitter");

    const firstLink = first.children.find(
      (child): child is Element =>
        child.type === "element" && child.tagName === "a"
    );
    const secondLink = second.children.find(
      (child): child is Element =>
        child.type === "element" && child.tagName === "a"
    );

    expect(firstLink?.properties?.href).toBe(
      "https://twitter.com/user/status/1234567890123456789"
    );
    expect(secondLink?.properties?.href).toBe(
      "https://x.com/another/status/9876543210987654321"
    );
  });

  it("fetches real tweet content via oEmbed", async () => {
    const tree = await process(
      '<img src="https://x.com/kepano/status/1882142872826442145" />'
    );

    const img = findFirstElement(tree, "img");
    expect(img).toBeUndefined();

    const blockquotes = findElements(tree, "blockquote");
    expect(blockquotes.length).toBeGreaterThanOrEqual(1);

    const tweet = blockquotes[0];
    expect(getClasses(tweet)).toContain("external-embed");
    expect(getClasses(tweet)).toContain("twitter");
  });

  it("enables checkbox inputs", async () => {
    const tree = await process('<input type="checkbox" disabled />');
    const input = findFirstElement(tree, "input");

    expect(input?.properties?.disabled).toBe(false);
    expect(input?.properties?.className).toEqual(["checkbox-toggle"]);
  });

  it("adds data-task attribute to task list items", async () => {
    const tree = await process(
      '<ul class="contains-task-list">' +
        '<li class="task-list-item"><input type="checkbox" disabled> unchecked</li>' +
        '<li class="task-list-item"><input type="checkbox" checked disabled> checked with x</li>' +
        "</ul>"
    );

    const items = findElements(tree, "li");
    expect(items).toHaveLength(2);

    const [unchecked, checked] = items;

    expect(unchecked.properties?.dataTask).toBe("");
    expect(getClasses(unchecked)).toContain("task-list-item");
    expect(getClasses(unchecked)).not.toContain("is-checked");

    expect(checked.properties?.dataTask).toBe("x");
    expect(getClasses(checked)).toContain("task-list-item");
    expect(getClasses(checked)).toContain("is-checked");
  });

  it("uses custom task character from dataTaskChar property", async () => {
    const tree = await process(
      '<ul class="contains-task-list">' +
        '<li class="task-list-item" data-task-char="?"><input type="checkbox" checked disabled> question</li>' +
        '<li class="task-list-item" data-task-char="/"><input type="checkbox" checked disabled> partial</li>' +
        '<li class="task-list-item" data-task-char=" "><input type="checkbox" disabled> unchecked custom</li>' +
        "</ul>"
    );

    const items = findElements(tree, "li");
    expect(items).toHaveLength(3);

    expect(items[0].properties?.dataTask).toBe("?");
    expect(items[1].properties?.dataTask).toBe("/");
    expect(items[2].properties?.dataTask).toBe(" ");
    expect(items[0].properties?.dataTaskChar).toBeUndefined();
    expect(items[1].properties?.dataTaskChar).toBeUndefined();
    expect(items[2].properties?.dataTaskChar).toBeUndefined();
  });

  it("adds mermaid expand controls", async () => {
    const tree = await process(
      '<pre><code class="mermaid">graph LR</code></pre>'
    );
    const pre = findFirstElement(tree, "pre");

    expect(pre?.children.length).toBe(3);

    const [button, code, container] = pre?.children as Element[];
    expect(button.tagName).toBe("button");
    expect(button.properties?.["aria-label"]).toBe("Expand mermaid diagram");
    expect(code.tagName).toBe("code");
    expect(container.properties?.id).toBe("mermaid-container");
    expect(container.properties?.role).toBe("dialog");
  });

  it("marks obsidian:// links", async () => {
    const tree = await process(
      '<a href="obsidian://open?vault=Test&file=note">Open</a>'
    );
    const link = findFirstElement(tree, "a");

    expect(link?.properties?.href).toBe("obsidian://open?vault=Test&file=note");
    expect(link?.properties?.dataObsidianUri).toBe(
      "obsidian://open?vault=Test&file=note"
    );
    expect(getClasses(link!)).toContain("obsidian-uri");
  });

  it("respects disabled options", async () => {
    const tree = await process(
      "<p>Keep ^blockId</p>" +
        '<img src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />' +
        '<img src="https://twitter.com/user/status/1234567890123456789" />' +
        '<a href="obsidian://open?vault=Test&file=note">Open</a>' +
        '<input type="checkbox" disabled />',
      {
        blockReferences: false,
        youTubeEmbed: false,
        tweetEmbed: false,
        checkbox: false,
        obsidianUri: false,
      }
    );

    const paragraph = findFirstElement(tree, "p");
    const img = findFirstElement(tree, "img");
    const iframe = findFirstElement(tree, "iframe");
    const blockquote = findFirstElement(tree, "blockquote");
    const link = findFirstElement(tree, "a");
    const input = findFirstElement(tree, "input");

    expect(paragraph?.properties?.id).toBeUndefined();
    if (!paragraph) throw new Error("Paragraph not found");
    const textChild = paragraph.children.find(
      (child: ElementContent): child is Text => child.type === "text"
    );
    expect(textChild?.value).toBe("Keep ^blockId");
    expect(img).toBeDefined();
    expect(iframe).toBeUndefined();
    expect(blockquote).toBeUndefined();
    expect(link?.properties?.className).toBeUndefined();
    expect(link?.properties?.dataObsidianUri).toBeUndefined();
    expect(input?.properties?.disabled).toBe(true);
    expect(input?.properties?.className).toBeUndefined();
  });

  it("applies multiple transforms in one pass", async () => {
    const tree = await process(
      '<p>Task ^task</p><input type="checkbox" checked disabled /><pre><code class="mermaid">graph LR</code></pre><img src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />'
    );

    const paragraph = findFirstElement(tree, "p");
    const input = findFirstElement(tree, "input");
    const iframe = findFirstElement(tree, "iframe");
    const pre = findFirstElement(tree, "pre");

    expect(paragraph?.properties?.id).toBe("task");
    expect(input?.properties?.disabled).toBe(false);
    expect(input?.properties?.className).toEqual(["checkbox-toggle"]);
    expect(iframe?.properties?.src).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );
    expect(pre?.children.length).toBe(3);
  });
});

describe("stripComments", () => {
  it("removes the empty comment marker remark-obsidian leaves behind", async () => {
    const tree = await process(
      "<p>before</p><obsidian-comment></obsidian-comment><p>after</p>"
    );
    expect(findFirstElement(tree, "obsidian-comment")).toBeUndefined();
    expect(findFirstElement(tree, "p")).toBeDefined();
  });

  it("removes several markers, including one nested in a paragraph", async () => {
    const tree = await process(
      "<p>a<obsidian-comment></obsidian-comment>b</p><obsidian-comment></obsidian-comment>"
    );
    expect(findFirstElement(tree, "obsidian-comment")).toBeUndefined();
  });

  it("leaves them alone when disabled, so the marker is observable", async () => {
    const tree = await process("<obsidian-comment></obsidian-comment>", {
      stripComments: false,
    });
    expect(findFirstElement(tree, "obsidian-comment")).toBeDefined();
  });
});

describe("bareFootnotes", () => {
  const REF =
    '<p>a<sup><a href="#user-content-fn-cell" id="user-content-fnref-cell" data-footnote-ref>1</a></sup></p>';
  const text = (tree: Root): string => {
    let out = "";
    const walk = (node: { type: string; children?: unknown[] }): void => {
      if (node.type === "text") out += (node as unknown as Text).value;
      for (const child of node.children ?? []) {
        walk(child as { type: string; children?: unknown[] });
      }
    };
    walk(tree);
    return out;
  };

  it("bares a reference whose target was never emitted", async () => {
    const tree = await process(REF);
    expect(findFirstElement(tree, "sup")).toBeUndefined();
    expect(text(tree)).toBe("acell");
  });

  it("shows the identifier, not the ordinal the renderer assigned", async () => {
    const tree = await process(REF);
    expect(text(tree)).not.toContain("1");
  });

  it("leaves a reference alone when its definition exists", async () => {
    const tree = await process(
      `${REF}<section class="footnotes"><li id="user-content-fn-cell">body</li></section>`
    );
    expect(findFirstElement(tree, "sup")).toBeDefined();
  });

  it("leaves them alone when disabled", async () => {
    const tree = await process(REF, { bareFootnotes: false });
    expect(findFirstElement(tree, "sup")).toBeDefined();
  });

  const defined = (id: string, ordinal: string) =>
    `<sup><a href="#user-content-fn-${id}" data-footnote-ref>${ordinal}</a></sup>`;
  const section = (id: string) =>
    `<section class="footnotes"><li id="user-content-fn-${id}">b</li></section>`;

  it("closes the gap a bared marker leaves in the numbering", async () => {
    const tree = await process(
      `<p>see ${REF} and ${defined("b", "2")}</p>${section("b")}`
    );
    expect(text(tree)).toContain("see acell and 1");
  });

  // `[link [^z]](url)`: the reference's anchor nests inside the link, and the
  // HTML parser splits it out, leaving an empty `sup` in the link and the anchor
  // beside it. `rehype-raw` does this in Quartz's chain; `rehype-parse` does the
  // same to this input.
  const NESTED = (target: string) =>
    `<p>a <a href="https://example.com">link <sup><a href="#user-content-fn-${target}" data-footnote-ref>1</a></sup></a> b</p>`;

  it("bares an undefined reference split out of a link, inside the link", async () => {
    const tree = await process(NESTED("z"));
    expect(findElements(tree, "a").length).toBe(1);
    expect(findFirstElement(tree, "sup")).toBeUndefined();
    expect(text(findFirstElement(tree, "a") as never)).toBe("link z");
    expect(text(tree)).toBe("a link z b");
  });

  it("leaves a defined reference split out of a link as Obsidian renders it", async () => {
    const tree = await process(`${NESTED("z")}${section("z")}`);
    expect(findElements(tree, "a").length).toBe(2);
    expect(findFirstElement(tree, "sup")).toBeDefined();
  });

  it("keeps repeated references to one definition on a shared number", async () => {
    const tree = await process(
      `<p>${REF} ${defined("b", "2")} ${defined("b", "2")}</p>${section("b")}`
    );
    expect(findElements(tree, "sup").map((s) => text(s as never))).toEqual([
      "1",
      "1",
    ]);
  });
});

/**
 * The rendering half of Obsidian 1.14's coloured highlights. `remark-obsidian`
 * keeps the emoji in the tree deliberately, so the strip has to happen here --
 * every expectation below is read from Obsidian's own recorded HTML.
 */
describe("coloured highlights", () => {
  const markOf = async (html: string, opts?: RehypeObsidianOptions) => {
    const mark = findFirstElement(await process(html, opts), "mark");
    return {
      colour: mark?.properties?.dataHighlight,
      text: (mark?.children?.[0] as Text | undefined)?.value,
    };
  };

  it("colours a highlight from its leading marker and drops it", async () => {
    // `==🔴 text==` renders as `<mark data-highlight="red"> text</mark>`: the
    // separating space survives, because the marker is removed and not the gap.
    expect(await markOf("<mark>\u{1F534} text</mark>")).toEqual({
      colour: "red",
      text: " text",
    });
  });

  it("maps all twelve markers onto six colours", async () => {
    const circles = [
      "\u{1F534}",
      "\u{1F7E0}",
      "\u{1F7E1}",
      "\u{1F7E2}",
      "\u{1F535}",
      "\u{1F7E3}",
    ];
    const squares = [
      "\u{1F7E5}",
      "\u{1F7E7}",
      "\u{1F7E8}",
      "\u{1F7E9}",
      "\u{1F7E6}",
      "\u{1F7EA}",
    ];
    const expected = ["red", "orange", "yellow", "green", "blue", "purple"];
    for (const [index, colour] of expected.entries()) {
      expect(await markOf(`<mark>${circles[index]} x</mark>`)).toEqual({
        colour,
        text: " x",
      });
      expect(await markOf(`<mark>${squares[index]} x</mark>`)).toEqual({
        colour,
        text: " x",
      });
    }
  });

  it("strips by codepoint, orphaning a variation selector as Obsidian does", async () => {
    // A grapheme-aware strip would swallow the selector too, which Obsidian keeps.
    expect(await markOf("<mark>\u{1F534}\uFE0F text</mark>")).toEqual({
      colour: "red",
      text: "\uFE0F text",
    });
  });

  it("keeps a marker that is not leading, and the second of two", async () => {
    expect(await markOf("<mark>te\u{1F534}xt</mark>")).toEqual({
      colour: undefined,
      text: "te\u{1F534}xt",
    });
    // Obsidian renders `==🔴 a ==🟢 b==` with the inner square still text.
    expect(await markOf("<mark>\u{1F534} a ==\u{1F7E2} b</mark>")).toEqual({
      colour: "red",
      text: " a ==\u{1F7E2} b",
    });
  });

  it("leaves a pictograph that is not one of the twelve", async () => {
    for (const other of [
      "\u{1F7E4}",
      "\u26AB",
      "\u26AA",
      "\u{1F7EB}",
      "\u2B1B",
      "\u2B1C",
    ]) {
      expect(await markOf(`<mark>${other} x</mark>`)).toEqual({
        colour: undefined,
        text: `${other} x`,
      });
    }
  });

  it("keeps whatever whitespace followed the marker", async () => {
    expect(await markOf("<mark>\u{1F534}\ttext</mark>")).toEqual({
      colour: "red",
      text: "\ttext",
    });
    expect(await markOf("<mark>\u{1F534}text</mark>")).toEqual({
      colour: "red",
      text: "text",
    });
  });

  it("can be turned off", async () => {
    expect(
      await markOf("<mark>\u{1F534} text</mark>", { colouredHighlights: false })
    ).toEqual({
      colour: undefined,
      text: "\u{1F534} text",
    });
  });
});
