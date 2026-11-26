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
      (child): child is Text => child.type === "text",
    );
    expect(textChild?.value).toBe("Some text");
  });

  // quartz-community/github-flavored-markdown#12
  it("points same-page block links at the block", async () => {
    const tree = await process(
      "<p>A paragraph. ^Real</p><ul><li>item ^item</li></ul>" +
        '<p><a href="#%5Ereal">md</a> <a href="#^item">raw</a> <a href="#%5EREAL">case</a>' +
        ' <a href="#%5Emissing">missing</a> <a href="#heading">heading</a>' +
        ' <a href="other#%5Ereal">other note</a></p>',
    );
    const hrefs = findElements(tree, "a").map((a) => a.properties?.href);
    expect(hrefs).toEqual([
      "#real",
      "#item",
      "#real",
      "#%5Emissing",
      "#heading",
      "other#%5Ereal",
    ]);
  });

  it("leaves block links alone without block references", async () => {
    const tree = await process(
      '<p>x ^real</p><p><a href="#%5Ereal">l</a></p>',
      {
        blockReferences: false,
      },
    );
    expect(findFirstElement(tree, "a")?.properties?.href).toBe("#%5Ereal");
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
      (child): child is Text => child.type === "text",
    );
    expect(texts?.map((t) => t.value).join("|")).toBe("x | y");
  });

  it("keeps a trailing block reference on its own paragraph", async () => {
    const tree = await process(
      '<ul><li>a</li></ul><p>x <a href="u">l</a> ^blk</p>',
    );
    expect(findFirstElement(tree, "p")?.properties?.id).toBe("blk");
    expect(findFirstElement(tree, "ul")?.properties?.id).toBeUndefined();
  });

  it("gives a table cell's block reference to the table", async () => {
    const tree = await process(
      "<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>a ^blk</td></tr></tbody></table>",
    );
    expect(findFirstElement(tree, "table")?.properties?.id).toBe("blk");
    const cell = findFirstElement(tree, "td");
    expect((cell?.children[0] as Text).value).toBe("a ");
  });

  // Recorded live against Obsidian 1.15.0: only text ending its wrapper or cell loses one.
  it("keeps a block reference that does not end its wrapper or cell", async () => {
    const cases: Array<[string, string, string]> = [
      [
        '<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>^blk<a href="w">w</a></td></tr></tbody></table>',
        "td",
        "^blk",
      ],
      ["<p><mark>a ^blk <code>c</code></mark></p>", "mark", "a ^blk "],
    ];
    for (const [html, tag, text] of cases) {
      const tree = await process(html);
      expect(
        (findFirstElement(tree, tag)?.children[0] as Text).value,
        html,
      ).toBe(text);
    }
    const stripped = await process("<p><mark>a ^blk</mark> b</p>");
    expect(
      (findFirstElement(stripped, "mark")?.children[0] as Text).value,
    ).toBe("a ");
  });

  // Recorded live against Obsidian 1.15.0: `[[n#^id]]` renders `n > ^id`, `[[n|a ^id]]` renders
  // `a ^id`, and neither names the paragraph; `[a ^id](n)` renders `a ` and names it.
  it("keeps a block reference in a wikilink's text, not in a Markdown link's", async () => {
    for (const [html, text] of [
      ['<p>16 <a href="n#^xyz" data-wikilink>n > ^xyz</a></p>', "n > ^xyz"],
      ['<p>19 <a href="n" data-wikilink="">al ^sss</a></p>', "al ^sss"],
    ]) {
      const tree = await process(html);
      expect(findFirstElement(tree, "p")?.properties?.id, html).toBeUndefined();
      expect((findFirstElement(tree, "a")?.children[0] as Text).value).toBe(
        text,
      );
    }
    const markdown = await process('<p>7 <a href="n">text ^abc</a></p>');
    expect(findFirstElement(markdown, "p")?.properties?.id).toBe("abc");
    expect((findFirstElement(markdown, "a")?.children[0] as Text).value).toBe(
      "text ",
    );
    const trailing = await process(
      '<p>18 text <a href="n" data-wikilink>n</a> ^rrr</p>',
    );
    expect(findFirstElement(trailing, "p")?.properties?.id).toBe("rrr");
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
      '<p>a <code class="language-math math-display">y^2</code><br>\nb</p>',
    );
    expect(findElements(tree, "br")).toHaveLength(0);
    const kept = await process(
      '<p>a <code class="language-math math-inline">y</code><br>\nb</p>',
    );
    expect(findElements(kept, "br")).toHaveLength(1);
  });

  it("replaces YouTube images with embeds", async () => {
    const tree = await process(
      '<img src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />',
    );
    const iframe = findFirstElement(tree, "iframe");

    expect(iframe).toBeDefined();
    expect(iframe?.properties?.src).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("embeds YouTube videos and playlists only from YouTube's hosts", async () => {
    const embedded = [
      [
        "https://youtu.be/dQw4w9WgXcQ",
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
      ],
      [
        "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
      ],
      [
        "https://youtube.com/embed/dQw4w9WgXcQ",
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
      ],
      [
        "https://www.youtube.com/playlist?list=PL123",
        "https://www.youtube.com/embed/videoseries?list=PL123",
      ],
    ];
    for (const [src, embed] of embedded) {
      const tree = await process(`<img src="${src}" />`);
      expect(findFirstElement(tree, "iframe")?.properties?.src, src).toBe(
        embed,
      );
    }
  });

  // quartz-community/obsidian-flavored-markdown#13
  it("leaves images elsewhere alone, even with a YouTube-like path", async () => {
    for (const src of [
      "https://pub-0123456789abcdef.r2.dev/Sisifo.webp",
      "https://example.com/watch?v=dQw4w9WgXcQ",
      "https://example.com/embed/dQw4w9WgXcQ",
      "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
      "https://youtube.com.example.org/watch?v=dQw4w9WgXcQ",
      "https://example.com/gallery?list=PL123",
      "images/v/abcdefghijk",
    ]) {
      const tree = await process(`<img src="${src}" />`);
      expect(findFirstElement(tree, "iframe"), src).toBeUndefined();
      expect(findFirstElement(tree, "img")?.properties?.src, src).toBe(src);
    }
  });

  it("falls back to link blockquote for unavailable tweets", async () => {
    const tree = await process(
      '<img src="https://twitter.com/user/status/1234567890123456789" />' +
        '<img src="https://x.com/another/status/9876543210987654321" />',
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
        child.type === "element" && child.tagName === "a",
    );
    const secondLink = second.children.find(
      (child): child is Element =>
        child.type === "element" && child.tagName === "a",
    );

    expect(firstLink?.properties?.href).toBe(
      "https://twitter.com/user/status/1234567890123456789",
    );
    expect(secondLink?.properties?.href).toBe(
      "https://x.com/another/status/9876543210987654321",
    );
  });

  it("fetches real tweet content via oEmbed", async () => {
    const tree = await process(
      '<img src="https://x.com/kepano/status/1882142872826442145" />',
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
    expect(input?.properties?.className).toEqual([
      "checkbox-toggle",
      "task-list-item-checkbox",
    ]);
  });

  it("adds data-task attribute to task list items", async () => {
    const tree = await process(
      '<ul class="contains-task-list">' +
        '<li class="task-list-item"><input type="checkbox" disabled> unchecked</li>' +
        '<li class="task-list-item"><input type="checkbox" checked disabled> checked with x</li>' +
        "</ul>",
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
        "</ul>",
    );

    const items = findElements(tree, "li");
    expect(items).toHaveLength(3);

    expect(items[0].properties?.dataTask).toBe("?");
    expect(items[1].properties?.dataTask).toBe("/");
    // As in Obsidian: an unchecked task is `data-task=""`.
    expect(items[2].properties?.dataTask).toBe("");
    expect(items[0].properties?.dataTaskChar).toBeUndefined();
    expect(items[1].properties?.dataTaskChar).toBeUndefined();
    expect(items[2].properties?.dataTaskChar).toBeUndefined();
  });

  it("adds mermaid expand controls", async () => {
    const tree = await process(
      '<pre><code class="mermaid">graph LR</code></pre>',
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

  it("wraps Pele's div.mermaid with the expand controls, once", async () => {
    const tree = await process(
      '<p>Before</p><div class="mermaid">graph LR</div><p>After</p>',
      { blockWrappers: false },
    );
    const wrapper = findFirstElement(tree, "div");

    expect(getClasses(wrapper!)).toEqual(["mermaid-diagram"]);
    const [button, diagram, container] = wrapper?.children as Element[];
    expect(button.tagName).toBe("button");
    expect(diagram.tagName).toBe("div");
    expect(getClasses(diagram)).toEqual(["mermaid"]);
    expect(diagram.children).toMatchObject([
      { type: "text", value: "graph LR" },
    ]);
    expect(container.properties?.id).toBe("mermaid-container");
    expect(wrapper?.children.length).toBe(3);
  });

  it("marks obsidian:// links", async () => {
    const tree = await process(
      '<a href="obsidian://open?vault=Test&file=note">Open</a>',
    );
    const link = findFirstElement(tree, "a");

    expect(link?.properties?.href).toBe("obsidian://open?vault=Test&file=note");
    expect(link?.properties?.dataObsidianUri).toBe(
      "obsidian://open?vault=Test&file=note",
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
      },
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
      (child: ElementContent): child is Text => child.type === "text",
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
      '<p>Task ^task</p><input type="checkbox" checked disabled /><pre><code class="mermaid">graph LR</code></pre><img src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />',
    );

    const paragraph = findFirstElement(tree, "p");
    const input = findFirstElement(tree, "input");
    const iframe = findFirstElement(tree, "iframe");
    const pre = findFirstElement(tree, "pre");

    expect(paragraph?.properties?.id).toBe("task");
    expect(input?.properties?.disabled).toBe(false);
    expect(input?.properties?.className).toEqual([
      "checkbox-toggle",
      "task-list-item-checkbox",
    ]);
    expect(iframe?.properties?.src).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
    expect(pre?.children.length).toBe(3);
  });
});

describe("stripComments", () => {
  it("removes the empty comment marker remark-obsidian leaves behind", async () => {
    const tree = await process(
      "<p>before</p><obsidian-comment></obsidian-comment><p>after</p>",
    );
    expect(findFirstElement(tree, "obsidian-comment")).toBeUndefined();
    expect(findFirstElement(tree, "p")).toBeDefined();
  });

  it("removes several markers, including one nested in a paragraph", async () => {
    const tree = await process(
      "<p>a<obsidian-comment></obsidian-comment>b</p><obsidian-comment></obsidian-comment>",
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
      `${REF}<section class="footnotes"><li id="user-content-fn-cell">body</li></section>`,
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
      `<p>see ${REF} and ${defined("b", "2")}</p>${section("b")}`,
      { footnoteMarkup: false },
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
      `<p>${REF} ${defined("b", "2")} ${defined("b", "2")}</p>${section("b")}`,
      { footnoteMarkup: false },
    );
    expect(findElements(tree, "sup").map((s) => text(s as never))).toEqual([
      "1",
      "1",
    ]);
  });
});

describe("heading data", () => {
  it("marks headings with their text, as Obsidian", async () => {
    const tree = await process(
      '<h2 id="x">Hello <em>world</em></h2><h3>Two</h3>',
    );
    expect(findFirstElement(tree, "h2")!.properties?.dataHeading).toBe(
      "Hello world",
    );
    expect(findFirstElement(tree, "h3")!.properties?.dataHeading).toBe("Two");
    const off = await process("<h2>A</h2>", { headingData: false });
    expect(
      findFirstElement(off, "h2")!.properties?.dataHeading,
    ).toBeUndefined();
  });
});

describe("list bullets", () => {
  const LIST =
    "<ul><li>a<ul><li>b</li></ul></li></ul>" +
    '<ul class="contains-task-list"><li class="task-list-item"><input type="checkbox"> c</li></ul>' +
    "<ol><li>d</li></ol>";

  it("marks bullet lists and opens each item with a bullet, as Obsidian", async () => {
    const tree = await process(LIST);
    const uls = findElements(tree, "ul");
    expect(uls.map((u) => u.properties?.className)).toEqual([
      ["has-list-bullet"],
      ["has-list-bullet"],
      ["contains-task-list", "has-list-bullet"],
    ]);
    for (const li of findElements(tree, "li").slice(0, 3)) {
      const first = li.children[0] as Element;
      expect(first.tagName).toBe("span");
      expect(first.properties?.className).toEqual(["list-bullet"]);
    }
    // Ordered lists have no bullets.
    const ol = findFirstElement(tree, "ol")!;
    expect((ol.children[0] as Element).children[0]).toMatchObject({
      type: "text",
      value: "d",
    });
  });

  it("adds one bullet per item and can be turned off", async () => {
    const bullets = (t: Root) =>
      findElements(t, "span").filter((s) =>
        String(s.properties?.className).includes("list-bullet"),
      );
    const tree = await process(LIST);
    expect(bullets(tree).length).toBe(3);
    const off = await process(LIST, { listBullets: false });
    expect(bullets(off).length).toBe(0);
  });
});

describe("collapse indicators", () => {
  const classes = (n: ElementContent | undefined) =>
    n?.type === "element" ? n.properties?.className : undefined;

  it("opens the note's headings with Obsidian's fold arrow", async () => {
    const tree = await process(
      '<h2 id="a">A</h2><blockquote><h3>In a quote</h3></blockquote>',
    );
    const h2 = findFirstElement(tree, "h2")!;
    const arrow = h2.children[0] as Element;
    expect(arrow.tagName).toBe("span");
    expect(arrow.properties?.className).toEqual([
      "heading-collapse-indicator",
      "collapse-indicator",
      "collapse-icon",
    ]);
    expect((arrow.children[0] as Element).properties?.className).toEqual([
      "svg-icon",
      "right-triangle",
    ]);
    // The heading's text is unchanged.
    expect(h2.properties?.dataHeading).toBe("A");
    // Only the note's own headings fold.
    expect(classes(findFirstElement(tree, "h3")!.children[0])).toBeUndefined();
  });

  it("puts the arrow after the bullet, before a task's checkbox, in items with a sublist", async () => {
    const tree = await process(
      "<ul><li>a<ul><li>b</li></ul></li></ul>" +
        "<ol><li>c<ul><li>d</li></ul></li></ol>" +
        '<ul class="contains-task-list"><li class="task-list-item"><input type="checkbox"> e<ul><li>f</li></ul></li></ul>',
    );
    const [a, b, c, d, e, f] = findElements(tree, "li");
    expect(a!.children.slice(0, 2).map(classes)).toEqual([
      ["list-bullet"],
      ["list-collapse-indicator", "collapse-indicator", "collapse-icon"],
    ]);
    expect(classes(c!.children[0])).toEqual([
      "list-collapse-indicator",
      "collapse-indicator",
      "collapse-icon",
    ]);
    expect(classes(e!.children[1])).toEqual([
      "list-collapse-indicator",
      "collapse-indicator",
      "collapse-icon",
    ]);
    expect((e!.children[2] as Element).tagName).toBe("input");
    for (const leaf of [b, d, f])
      expect(
        leaf!.children.some((n) =>
          String(classes(n)).includes("collapse-indicator"),
        ),
      ).toBe(false);
  });

  it("adds one arrow per heading or item and can be turned off", async () => {
    const html = "<h2>A</h2><ul><li>a<ul><li>b</li></ul></li></ul>";
    const count = (t: Root) =>
      findElements(t, "span").filter((s) =>
        String(s.properties?.className).includes("collapse-indicator"),
      ).length;
    const tree = await process(html);
    expect(count(tree)).toBe(2);
    const again = await process(html);
    await unified().use(rehypeObsidian).run(again);
    expect(count(again)).toBe(2);
    expect(count(await process(html, { collapseIndicators: false }))).toBe(0);
  });
});

describe("footnote markup", () => {
  const textOf = (node: Element): string =>
    node.children.map((c) => (c.type === "text" ? c.value : "")).join("");
  // What mdast-util-to-hast emits, through rehype-raw (boolean attributes as "").
  const NOTE =
    '<p>text<sup><a href="#user-content-fn-1" id="user-content-fnref-1" data-footnote-ref="" aria-describedby="footnote-label">1</a></sup></p>' +
    '<section data-footnotes="" class="footnotes"><h2 class="sr-only" id="footnote-label">Footnotes</h2>' +
    '<ol><li id="user-content-fn-1"><p>body <a href="#user-content-fnref-1" data-footnote-backref="">↩</a></p></li></ol></section>';

  it("uses Obsidian's classes and [n] labels", async () => {
    const tree = await process(NOTE);
    const sup = findFirstElement(tree, "sup")!;
    expect(sup.properties?.className).toEqual(["footnote-ref"]);
    const [ref, back] = findElements(tree, "a");
    expect(ref!.properties?.className).toEqual(["footnote-link"]);
    expect(textOf(ref!)).toBe("[1]");
    expect(back!.properties?.className).toEqual([
      "footnote-backref",
      "footnote-link",
    ]);
  });

  it("opens the footnotes with a rule, in place of the screen-reader heading", async () => {
    const tree = await process(NOTE, { footnoteHeading: false });
    const section = findFirstElement(tree, "section")!;
    const tags = section.children
      .filter((c): c is Element => c.type === "element")
      .map((c) => c.tagName);
    expect(tags).toEqual(["hr", "ol"]);
    // The heading's text names the section; the reference no longer points at it.
    expect(section.properties?.ariaLabel).toBe("Footnotes");
    const [ref] = findElements(tree, "a");
    expect(ref!.properties?.ariaDescribedBy).toBeUndefined();
    // Idempotent.
    const again = await process(NOTE.replace("</h2>", "</h2><hr>"), {
      footnoteHeading: false,
    });
    expect(findElements(again, "hr").length).toBe(1);
  });

  it("keeps the screen-reader heading by default", async () => {
    const tree = await process(NOTE);
    const section = findFirstElement(tree, "section")!;
    const tags = section.children
      .filter((c): c is Element => c.type === "element")
      .map((c) => c.tagName);
    expect(tags).toEqual(["h2", "hr", "ol"]);
    const [ref] = findElements(tree, "a");
    expect(ref!.properties?.ariaDescribedBy).toEqual(["footnote-label"]);
  });

  it("puts Obsidian's back-link right after the text, and ids on the items", async () => {
    const tree = await process(NOTE);
    const li = findFirstElement(tree, "li")!;
    expect(li.properties?.dataFootnoteId).toBe("user-content-fn-1");
    const p = findFirstElement({ type: "root", children: [li] }, "p")!;
    expect(p.children[0]).toMatchObject({ type: "text", value: "body" });
    const back = findElements(tree, "a")[1]!;
    expect(textOf(back)).toBe("↩︎");
  });

  it("an inline footnote's text is the item's own", async () => {
    const tree = await process(NOTE.replaceAll("fn-1", "fn-inline-footnote-1"));
    const li = findFirstElement(tree, "li")!;
    expect(li.children[0]).toMatchObject({ type: "text", value: "body" });
    expect(findElements({ type: "root", children: [li] }, "p").length).toBe(0);
  });

  it("leaves them alone when disabled", async () => {
    const tree = await process(NOTE, { footnoteMarkup: false });
    expect(
      findFirstElement(tree, "sup")!.properties?.className,
    ).toBeUndefined();
    expect(findElements(tree, "hr").length).toBe(0);
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
      await markOf("<mark>\u{1F534} text</mark>", {
        colouredHighlights: false,
      }),
    ).toEqual({
      colour: undefined,
      text: "\u{1F534} text",
    });
  });
});

describe("block wrappers", () => {
  const wrappers = (tree: Root) =>
    tree.children
      .filter((c): c is Element => c.type === "element")
      .map((w) => [
        getClasses(w).join("."),
        w.children
          .filter((c): c is Element => c.type === "element")
          .map((c) => c.tagName)
          .join("+"),
      ]);

  it("wraps each top-level block in Obsidian's div.el-*", async () => {
    const tree = await process(
      "<h2>Title</h2>\n<p>Text</p>\n<ul><li>a</li></ul>\n<blockquote><p>q</p></blockquote>\n<table><tr><td>1</td></tr></table>\n<hr>",
    );
    expect(wrappers(tree)).toEqual([
      ["el-h2", "h2"],
      ["el-p", "p"],
      ["el-ul", "ul"],
      ["el-blockquote", "blockquote"],
      ["el-table", "table"],
      ["el-hr", "hr"],
    ]);
    // Whitespace between blocks stays between the wrappers.
    expect(tree.children[1]).toMatchObject({ type: "text", value: "\n" });
  });

  it("leaves nested blocks unwrapped", async () => {
    const tree = await process(
      '<div class="callout" data-callout="note"><div class="callout-content"><p>Inside</p></div></div><blockquote><p>q</p></blockquote>',
    );
    expect(wrappers(tree)).toEqual([
      ["el-div", "div"],
      ["el-blockquote", "blockquote"],
    ]);
    // Only the top-level blocks: the callout's paragraph has none.
    const content = findElements(tree, "div").find((d) =>
      getClasses(d).includes("callout-content"),
    );
    expect((content?.children[0] as Element).tagName).toBe("p");
  });

  it("names Quartz's code, diagram, maths and footnote blocks as Obsidian does", async () => {
    const tree = await process(
      '<figure data-rehype-pretty-code-figure><pre><code>x</code></pre></figure><div class="mermaid">graph LR</div><span class="katex-display">m</span><pre><code class="language-math math-display">x</code></pre><figure data-rehype-pretty-code-figure><pre data-language="math"><code data-language="math">y</code></pre></figure><section data-footnotes class="footnotes"><ol><li>f</li></ol></section>',
    );
    expect(wrappers(tree).map(([w]) => w)).toEqual([
      "el-pre",
      "el-pre",
      "el-div",
      "el-div",
      "el-div",
      "el-section",
    ]);
    // The diagram's expand controls are inside its wrapper.
    expect(wrappers(tree)[1]?.[1]).toBe("div");
  });

  it("keeps a note embed in its paragraph's wrapper", async () => {
    const tree = await process(
      '<p></p><div class="transclude internal-embed markdown-embed"><a href="x" class="transclude-inner">x</a></div><p>After</p>',
    );
    expect(wrappers(tree)).toEqual([
      ["el-p", "p+div"],
      ["el-p", "p"],
    ]);
    // With the empty paragraph the parser leaves after it.
    const split = await process(
      '<p></p><div class="transclude internal-embed markdown-embed"><a href="x" class="transclude-inner">x</a></div><p></p><p>After</p>',
    );
    expect(wrappers(split)).toEqual([
      ["el-p", "p+div+p"],
      ["el-p", "p"],
    ]);
  });

  it("wraps once", async () => {
    const once = await process("<p>a</p><h3>b</h3>");
    const twice = (await unified()
      .use(rehypeObsidian)
      .run(structuredClone(once))) as Root;
    expect(wrappers(twice)).toEqual([
      ["el-p", "p"],
      ["el-h3", "h3"],
    ]);
  });

  it("can be turned off", async () => {
    const tree = await process("<p>a</p>", { blockWrappers: false });
    expect(wrappers(tree)).toEqual([["", ""]]);
  });
});
