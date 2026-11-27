import type { Element, ElementContent, Root, Text } from "hast";
import rehypeParse from "rehype-parse";
import { unified } from "unified";
import { afterEach, describe, expect, it, vi } from "vitest";

import rehypeObsidian, {
  blockReferences,
  type RehypeObsidianOptions,
} from "../src/index.js";

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

    expect(paragraph?.properties?.id).toBe("^blockid");

    if (!paragraph) throw new Error("Paragraph not found");
    const textChild = paragraph.children.find(
      (child): child is Text => child.type === "text"
    );
    expect(textChild?.value).toBe("Some text");
  });

  // quartz-community/github-flavored-markdown#12
  it("points same-page block links at the block", async () => {
    const tree = await process(
      "<p>A paragraph. ^Real</p><ul><li>item ^item</li></ul>" +
        '<p><a href="#%5Ereal">md</a> <a href="#^item">raw</a> <a href="#%5EREAL">case</a>' +
        ' <a href="#%5Emissing">missing</a> <a href="#heading">heading</a>' +
        ' <a href="other#%5Ereal">other note</a></p>'
    );
    const hrefs = findElements(tree, "a").map((a) => a.properties?.href);
    expect(hrefs).toEqual([
      "#^real",
      "#^item",
      "#^real",
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
      }
    );
    expect(findFirstElement(tree, "a")?.properties?.href).toBe("#%5Ereal");
  });

  it("gives a block and a heading of the same name different ids", async () => {
    const tree = await process(
      '<h2 id="para-1">Para 1</h2><p>some para ^para-1</p>' +
        '<p><a href="#%5Epara-1">block</a> <a href="#para-1">heading</a></p>'
    );
    expect(findFirstElement(tree, "h2")?.properties?.id).toBe("para-1");
    expect(findElements(tree, "p")[0]?.properties?.id).toBe("^para-1");
    expect(findElements(tree, "a").map((a) => a.properties?.href)).toEqual([
      "#^para-1",
      "#para-1",
    ]);
  });

  it("keys file.data.blocks by the bare name", () => {
    const tree = unified()
      .use(rehypeParse, { fragment: true })
      .parse("<p>x ^Blk</p>");
    const file: { data?: Record<string, unknown> } = {};
    blockReferences(tree, file);
    const blocks = file.data!.blocks as Record<string, Element>;
    expect(Object.keys(blocks)).toEqual(["blk"]);
    expect(blocks.blk!.properties.id).toBe("^blk");
  });

  it("lowercases mixed-case block reference IDs", async () => {
    const tree = await process("<p>Content ^CB-A34B78B4ICqt6zX6xBDAh6CT</p>");
    const paragraph = findFirstElement(tree, "p");

    expect(paragraph?.properties?.id).toBe("^cb-a34b78b4icqt6zx6xbdah6ct");
  });

  // Recorded live against Obsidian 1.15.0: every inline text ending in an identifier is
  // stripped, and the last one names the block.
  it("strips a block reference inside emphasis", async () => {
    const tree = await process("<p>x <strong>^blk</strong> y</p>");
    const paragraph = findFirstElement(tree, "p");
    expect(paragraph?.properties?.id).toBe("^blk");
    expect(findFirstElement(tree, "strong")?.children).toEqual([]);
  });

  it("names the block by the last of several block references", async () => {
    const tree = await process("<p>x <strong>^blk</strong> y ^two</p>");
    const paragraph = findFirstElement(tree, "p");
    expect(paragraph?.properties?.id).toBe("^two");
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
    expect(findFirstElement(tree, "p")?.properties?.id).toBe("^blk");
    expect(findFirstElement(tree, "ul")?.properties?.id).toBeUndefined();
  });

  it("gives a table cell's block reference to the table", async () => {
    const tree = await process(
      "<table><thead><tr><th>h</th></tr></thead><tbody><tr><td>a ^blk</td></tr></tbody></table>"
    );
    expect(findFirstElement(tree, "table")?.properties?.id).toBe("^blk");
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
        html
      ).toBe(text);
    }
    const stripped = await process("<p><mark>a ^blk</mark> b</p>");
    expect(
      (findFirstElement(stripped, "mark")?.children[0] as Text).value
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
        text
      );
    }
    const markdown = await process('<p>7 <a href="n">text ^abc</a></p>');
    expect(findFirstElement(markdown, "p")?.properties?.id).toBe("^abc");
    expect((findFirstElement(markdown, "a")?.children[0] as Text).value).toBe(
      "text "
    );
    const trailing = await process(
      '<p>18 text <a href="n" data-wikilink>n</a> ^rrr</p>'
    );
    expect(findFirstElement(trailing, "p")?.properties?.id).toBe("^rrr");
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
      // Protocol-relative and plain-HTTP URLs, as notes copy them
      [
        "//www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
      ],
      [
        "http://youtube.com/watch?v=dQw4w9WgXcQ",
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
      ],
    ];
    for (const [src, embed] of embedded) {
      const tree = await process(`<img src="${src}" />`);
      expect(findFirstElement(tree, "iframe")?.properties?.src, src).toBe(
        embed
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
      "https://notyoutu.be/dQw4w9WgXcQ",
      "https://youtu.be.example.org/watch?v=dQw4w9WgXcQ",
      "ftp://www.youtube.com/watch?v=dQw4w9WgXcQ",
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
    // As in Obsidian: an unchecked task is `data-task=""`.
    expect(items[2].properties?.dataTask).toBe("");
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

  it("wraps Pele's div.mermaid with the expand controls, once", async () => {
    const tree = await process(
      '<p>Before</p><div class="mermaid">graph LR</div><p>After</p>',
      { blockWrappers: false }
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

    expect(paragraph?.properties?.id).toBe("^task");
    expect(input?.properties?.disabled).toBe(false);
    expect(input?.properties?.className).toEqual([
      "checkbox-toggle",
      "task-list-item-checkbox",
    ]);
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
      `<p>see ${REF} and ${defined("b", "2")}</p>${section("b")}`,
      { footnoteMarkup: false }
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
      { footnoteMarkup: false }
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
      '<h2 id="x">Hello <em>world</em></h2><h3>Two</h3>'
    );
    expect(findFirstElement(tree, "h2")!.properties?.dataHeading).toBe(
      "Hello world"
    );
    expect(findFirstElement(tree, "h3")!.properties?.dataHeading).toBe("Two");
    // A comment in the heading (kept by rehype-raw) is not part of its text.
    const commented = await process("<h2>A <!-- note -->B</h2>");
    expect(findFirstElement(commented, "h2")!.properties?.dataHeading).toBe(
      "A B"
    );
    // One a step before it wrote (github-flavored-markdown, as written) stays;
    // other blocks get none.
    const written = await process(
      '<h2 data-heading="a -> b">a → b</h2>\n<p>p</p>\n<hr>'
    );
    expect(findFirstElement(written, "h2")!.properties?.dataHeading).toBe(
      "a -> b"
    );
    for (const tag of ["p", "hr"])
      expect(
        findFirstElement(written, tag)!.properties?.dataHeading
      ).toBeUndefined();
    const off = await process("<h2>A</h2>", { headingData: false });
    expect(
      findFirstElement(off, "h2")!.properties?.dataHeading
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
        String(s.properties?.className).includes("list-bullet")
      );
    const tree = await process(LIST);
    expect(bullets(tree).length).toBe(3);
    const off = await process(LIST, { listBullets: false });
    expect(bullets(off).length).toBe(0);
  });

  it("reads lists as remark-rehype emits them, with newlines between items, idempotently", async () => {
    // `- a\n- b\n  1. c` through remark-parse, remark-gfm and remark-rehype
    const html =
      "<ul>\n<li>a</li>\n<li>b\n<ol>\n<li>c</li>\n</ol>\n</li>\n</ul>";
    const once = await process(html);
    const check = (tree: Root) => {
      const ul = findFirstElement(tree, "ul")!;
      expect(ul.properties?.className).toEqual(["has-list-bullet"]);
      const [a, b, c] = findElements(tree, "li");
      expect(getClasses(a!.children[0] as Element)).toEqual(["list-bullet"]);
      expect(
        b!.children.slice(0, 2).map((n) => getClasses(n as Element))
      ).toEqual([
        ["list-bullet"],
        ["list-collapse-indicator", "collapse-indicator", "collapse-icon"],
      ]);
      expect(c!.children).toMatchObject([{ type: "text", value: "c" }]);
      const spans = findElements(tree, "span").map((n) => getClasses(n)[0]);
      expect(spans).toEqual([
        "list-bullet",
        "list-bullet",
        "list-collapse-indicator",
      ]);
    };
    check(once);
    const twice = (await unified()
      .use(rehypeObsidian)
      .run(structuredClone(once))) as Root;
    check(twice);
    expect(twice).toEqual(once);
  });
});

describe("collapse indicators", () => {
  const classes = (n: ElementContent | undefined) =>
    n?.type === "element" ? n.properties?.className : undefined;

  it("opens the note's headings with Obsidian's fold arrow", async () => {
    const tree = await process(
      '<h2 id="a">A</h2><blockquote><h3>In a quote</h3></blockquote>'
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
        '<ul class="contains-task-list"><li class="task-list-item"><input type="checkbox"> e<ul><li>f</li></ul></li></ul>'
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
          String(classes(n)).includes("collapse-indicator")
        )
      ).toBe(false);
  });

  it("adds one arrow per heading or item and can be turned off", async () => {
    const html = "<h2>A</h2><ul><li>a<ul><li>b</li></ul></li></ul>";
    const count = (t: Root) =>
      findElements(t, "span").filter((s) =>
        String(s.properties?.className).includes("collapse-indicator")
      ).length;
    const tree = await process(html);
    expect(count(tree)).toBe(2);
    // Without the block wrappers the heading stays at the top level, where a
    // second pass looks for it: it must find the arrow already there.
    const unwrapped = { blockWrappers: false };
    const again = await process(html, unwrapped);
    await unified().use(rehypeObsidian, unwrapped).run(again);
    expect(count(again)).toBe(2);
    expect(
      getClasses(findFirstElement(again, "h2")!.children[0] as Element)
    ).toEqual([
      "heading-collapse-indicator",
      "collapse-indicator",
      "collapse-icon",
    ]);
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

  // `Text[^1] and more[^2].\n\n[^1]: two words\n[^2]: see [x](y)` through
  // remark-parse, remark-gfm and remark-rehype: newlines between the items,
  // and around each item's paragraph.
  const PIPELINE =
    '<p>Text<sup><a href="#user-content-fn-1" id="user-content-fnref-1" data-footnote-ref aria-describedby="footnote-label">1</a></sup> and more<sup><a href="#user-content-fn-2" id="user-content-fnref-2" data-footnote-ref aria-describedby="footnote-label">2</a></sup>.</p>\n' +
    '<section data-footnotes class="footnotes"><h2 class="sr-only" id="footnote-label">Footnotes</h2>\n<ol>\n' +
    '<li id="user-content-fn-1">\n<p>two words <a href="#user-content-fnref-1" data-footnote-backref="" aria-label="Back to reference 1" class="data-footnote-backref">↩</a></p>\n</li>\n' +
    '<li id="user-content-fn-2">\n<p>see <a href="y">x</a> <a href="#user-content-fnref-2" data-footnote-backref="" aria-label="Back to reference 2" class="data-footnote-backref">↩</a></p>\n</li>\n' +
    "</ol>\n</section>";

  it("reads the footnotes remark-rehype emits", async () => {
    const tree = await process(PIPELINE);
    const items = findElements(tree, "li");
    expect(items.map((li) => li.properties?.dataFootnoteId)).toEqual([
      "user-content-fn-1",
      "user-content-fn-2",
    ]);
    const [first, second] = findElements(tree, "p").slice(1);
    // The space between the words stays; the one before the back-link goes.
    expect(first!.children).toMatchObject([
      { type: "text", value: "two words" },
      { type: "element", tagName: "a", children: [{ value: "↩︎" }] },
    ]);
    // After a link, the whitespace node before the back-link is removed.
    expect(second!.children).toMatchObject([
      { type: "text", value: "see " },
      { type: "element", tagName: "a", properties: { href: "y" } },
      { type: "element", tagName: "a", children: [{ value: "↩︎" }] },
    ]);
    expect(second!.children.length).toBe(3);
  });

  it("leaves a <sup> that is not a footnote reference alone", async () => {
    const tree = await process(
      '<p>x<sup>2</sup> and <sup><a href="#a">3</a></sup></p>'
    );
    const sups = findElements(tree, "sup");
    expect(sups.map((s) => s.properties?.className)).toEqual([
      undefined,
      undefined,
    ]);
    expect(textOf(sups[0]!)).toBe("2");
    const link = findFirstElement(tree, "a")!;
    expect(link.properties?.className).toBeUndefined();
    expect(textOf(link)).toBe("3");
  });

  it("leaves them alone when disabled", async () => {
    const tree = await process(NOTE, { footnoteMarkup: false });
    expect(
      findFirstElement(tree, "sup")!.properties?.className
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
      })
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
      "<h2>Title</h2>\n<p>Text</p>\n<ul><li>a</li></ul>\n<blockquote><p>q</p></blockquote>\n<table><tr><td>1</td></tr></table>\n<hr>"
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
      '<div class="callout" data-callout="note"><div class="callout-content"><p>Inside</p></div></div><blockquote><p>q</p></blockquote>'
    );
    expect(wrappers(tree)).toEqual([
      ["el-div", "div"],
      ["el-blockquote", "blockquote"],
    ]);
    // Only the top-level blocks: the callout's paragraph has none.
    const content = findElements(tree, "div").find((d) =>
      getClasses(d).includes("callout-content")
    );
    expect((content?.children[0] as Element).tagName).toBe("p");
  });

  it("names Quartz's code, diagram, maths and footnote blocks as Obsidian does", async () => {
    const tree = await process(
      '<figure data-rehype-pretty-code-figure><pre><code>x</code></pre></figure><div class="mermaid">graph LR</div><span class="katex-display">m</span><pre><code class="language-math math-display">x</code></pre><figure data-rehype-pretty-code-figure><pre data-language="math"><code data-language="math">y</code></pre></figure><section data-footnotes class="footnotes"><ol><li>f</li></ol></section>'
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
      '<p></p><div class="transclude internal-embed markdown-embed"><a href="x" class="transclude-inner">x</a></div><p>After</p>'
    );
    expect(wrappers(tree)).toEqual([
      ["el-p", "p+div"],
      ["el-p", "p"],
    ]);
    // With the empty paragraph the parser leaves after it.
    const split = await process(
      '<p></p><div class="transclude internal-embed markdown-embed"><a href="x" class="transclude-inner">x</a></div><p></p><p>After</p>'
    );
    expect(wrappers(split)).toEqual([
      ["el-p", "p+div+p"],
      ["el-p", "p"],
    ]);
  });

  it("names a figure without code el-figure", async () => {
    const tree = await process(
      '<figure><img src="x"><figcaption>c</figcaption></figure>'
    );
    expect(wrappers(tree)).toEqual([["el-figure", "figure"]]);
    // A code block's figure without rehype-pretty-code's attribute is still one
    const code = await process(
      "<figure>\n<pre><code>x</code></pre>\n</figure>"
    );
    expect(wrappers(code)).toEqual([["el-pre", "figure"]]);
  });

  it("wraps once, with newlines between the blocks", async () => {
    const once = await process("<p>a</p>\n<h3>b</h3>\n");
    const twice = (await unified()
      .use(rehypeObsidian)
      .run(structuredClone(once))) as Root;
    expect(wrappers(twice)).toEqual([
      ["el-p", "p"],
      ["el-h3", "h3"],
    ]);
    expect(twice).toEqual(once);
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
    const tree = await process("<p>a</p>\n<h3>b</h3>", {
      blockWrappers: false,
    });
    expect(
      tree.children.map((c) => (c.type === "element" ? c.tagName : c.type))
    ).toEqual(["p", "text", "h3"]);
    expect(findElements(tree, "div")).toEqual([]);
  });
});

// An identifier on a line of its own, after the block it names, as remark-rehype emits it: the
// blocks with a "\n" text between them. Obsidian 1.15.0 renders the block alone and registers
// the identifier on it (remark-obsidian goldens `block-ref/own-line-after-*`).
describe("block reference on its own line", () => {
  it("names the quote above it and removes its paragraph", async () => {
    const tree = await process(
      "<blockquote>\n<p>q</p>\n</blockquote>\n<p>^Quote</p>"
    );
    expect(findFirstElement(tree, "blockquote")?.properties?.id).toBe("^quote");
    expect(findElements(tree, "p").map((p) => p.children.length)).toEqual([1]);
  });

  it("names a callout above it", async () => {
    const tree = await process(
      '<div class="callout"><p>c</p></div>\n<p>^call</p>',
      { blockWrappers: false }
    );
    expect(findFirstElement(tree, "div")?.properties?.id).toBe("^call");
  });

  it("leaves a quote alone when the paragraph after it holds more than an identifier", async () => {
    const tree = await process(
      "<blockquote>\n<p>q</p>\n</blockquote>\n<p><em>x</em> ^b</p>"
    );
    expect(
      findFirstElement(tree, "blockquote")?.properties?.id
    ).toBeUndefined();
    const tree2 = await process(
      "<blockquote>\n<p>q</p>\n</blockquote>\n<p>not ^b here</p>"
    );
    expect(
      findFirstElement(tree2, "blockquote")?.properties?.id
    ).toBeUndefined();
  });

  it("names the list, table or paragraph above it", async () => {
    for (const [html, tag] of [
      ["<ul>\n<li>x</li>\n</ul>\n<p>^b</p>", "ul"],
      ["<table><thead><tr><th>x</th></tr></thead></table>\n<p>^b</p>", "table"],
      ["<p>x</p>\n<p>^b</p>", "p"],
    ] as const) {
      const tree = await process(html);
      expect(findFirstElement(tree, tag)?.properties?.id, html).toBe("^b");
    }
  });

  it("names itself when nothing comes before it", async () => {
    const file: { data?: Record<string, unknown> } = {};
    const tree = unified()
      .use(rehypeParse, { fragment: true })
      .parse("<p>^b</p>");
    blockReferences(tree, file);
    expect(Object.keys(file.data!.blocks as object)).toEqual(["b"]);
  });

  // Obsidian renders no paragraph for the identifier, as for the quote's.
  it("removes the emptied paragraph under a list, table or paragraph", async () => {
    for (const html of [
      "<ul>\n<li>x</li>\n</ul>\n<p>^b</p>",
      "<table><thead><tr><th>x</th></tr></thead></table>\n<p>^b</p>",
      "<p>x</p>\n<p>^b</p>",
    ]) {
      const tree = await process(html, { blockWrappers: false });
      expect(
        findElements(tree, "p").filter((p) => p.children.length === 0),
        html
      ).toEqual([]);
      expect(findElements(tree, "p").length, html).toBe(
        html.startsWith("<p>") ? 1 : 0
      );
    }
  });

  it("leaves no wrapper of its own with block wrappers on", async () => {
    const tree = await process("<ul>\n<li>x</li>\n</ul>\n<p>^b</p>\n<p>y</p>");
    const wrappers = findElements(tree, "div").filter((d) =>
      getClasses(d).includes("el-p")
    );
    expect(wrappers).toHaveLength(1);
    expect(findFirstElement(tree, "ul")?.properties?.id).toBe("^b");
    expect(findElements(tree, "p")).toHaveLength(1);
  });

  it("names the right blocks when two identifiers follow each other", async () => {
    const file: { data?: Record<string, unknown> } = {};
    const tree = unified()
      .use(rehypeParse, { fragment: true })
      .parse("<p>x</p>\n<p>^a</p>\n<ul>\n<li>y</li>\n</ul>\n<p>^b</p>");
    blockReferences(tree, file);
    expect(findFirstElement(tree, "p")?.properties?.id).toBe("^a");
    expect(findFirstElement(tree, "ul")?.properties?.id).toBe("^b");
    expect(findElements(tree, "p")).toHaveLength(1);
  });
});

describe("tweet embeds, offline", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const tweet = '<p><img src="https://x.com/user/status/123"></p>';

  it("asks Twitter's oEmbed endpoint for the tweet, without its script", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetch);
    await process(tweet);
    expect(fetch).toHaveBeenCalledTimes(1);
    const url = new URL(String((fetch.mock.calls[0] as unknown[])[0]));
    expect(url.origin + url.pathname).toBe(
      "https://publish.twitter.com/oembed"
    );
    expect(url.searchParams.get("url")).toBe("https://x.com/user/status/123");
    expect(url.searchParams.get("omit_script")).toBe("true");
  });

  it("renders the oEmbed HTML in place of the image, with Quartz's classes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          author_name: "user",
          html: '<blockquote class="twitter-tweet"><p>hello</p></blockquote>\n',
        })
      )
    );
    const tree = await process(tweet);
    expect(findFirstElement(tree, "img")).toBeUndefined();
    const quote = findFirstElement(tree, "blockquote")!;
    expect(getClasses(quote)).toEqual([
      "twitter-tweet",
      "external-embed",
      "twitter",
    ]);
    expect(findFirstElement(tree, "p")?.children[0]).toMatchObject({
      tagName: "blockquote",
    });
  });

  it("wraps oEmbed HTML without an element in a div", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ author_name: "u", html: "just text" }))
    );
    const tree = await process(tweet, { blockWrappers: false });
    const div = findFirstElement(tree, "div")!;
    expect(getClasses(div)).toEqual(["external-embed", "twitter"]);
    expect(div.children).toMatchObject([{ type: "text", value: "just text" }]);
  });

  it("falls back to a link when the request fails or the answer has no HTML", async () => {
    for (const fetch of [
      vi.fn(async () => {
        throw new Error("offline");
      }),
      vi.fn(async () => new Response("", { status: 500 })),
      vi.fn(async () => Response.json({ author_name: "u" })),
    ]) {
      vi.stubGlobal("fetch", fetch);
      const tree = await process(tweet);
      const quote = findFirstElement(tree, "blockquote")!;
      expect(getClasses(quote)).toEqual(["external-embed", "twitter"]);
      const link = findFirstElement(tree, "a")!;
      expect(link.properties.href).toBe("https://x.com/user/status/123");
      expect((link.children[0] as Text).value).toBe("Tweet by @user");
    }
  });

  it("only embeds status URLs on Twitter's hosts, and fetches nothing otherwise", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const src of [
      "https://x.com/user",
      "https://x.com/user/status/abc",
      "https://example.com/user/status/123",
      "http://x.com/user/status/123",
      "https://x.com/user/status/123/photo/1",
    ]) {
      const tree = await process(`<img src="${src}">`);
      expect(findFirstElement(tree, "img")?.properties?.src, src).toBe(src);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("display math breaks under KaTeX and MathJax", () => {
  it("drops the break after rendered display math, across spaces", async () => {
    for (const math of [
      '<span class="katex-display">y</span>',
      '<mjx-container display="true">y</mjx-container>',
      '<code class="math-display">y</code> \t',
    ]) {
      const tree = await process(`<p>a ${math}<br>\nb</p>`);
      expect(findElements(tree, "br"), math).toHaveLength(0);
    }
  });

  it("keeps the break after inline math, and one not straight after the formula", async () => {
    for (const html of [
      '<p>a <mjx-container display="false">y</mjx-container><br>\nb</p>',
      '<p>a <span class="katex">y</span><br>\nb</p>',
      '<p>a <span class="katex-display">y</span> x<br>\nb</p>',
    ]) {
      const tree = await process(html);
      expect(findElements(tree, "br"), html).toHaveLength(1);
    }
  });
});

describe("obsidian:// links with classes", () => {
  it("adds obsidian-uri once, after the link's own classes", async () => {
    const tree = await process(
      '<a class="external" href="obsidian://open?file=a">a</a>' +
        '<a class="obsidian-uri x" href="obsidian://open?file=b">b</a>' +
        '<a href="https://obsidian.md">c</a>'
    );
    const [a, b, c] = findElements(tree, "a");
    expect(getClasses(a!)).toEqual(["external", "obsidian-uri"]);
    expect(getClasses(b!)).toEqual(["obsidian-uri", "x"]);
    expect(getClasses(c!)).toEqual([]);
    expect(c!.properties.dataObsidianUri).toBeUndefined();
  });
});

describe("footnote markup, edge cases", () => {
  const ref = (label: string, describedBy = "footnote-label") =>
    `<sup><a href="#user-content-fn-1" id="user-content-fnref-1" data-footnote-ref="" aria-describedby="${describedBy}">${label}</a></sup>`;
  const textOf = (node: Element): string =>
    node.children.map((c) => (c.type === "text" ? c.value : "")).join("");

  it("brackets multi-digit ordinals and leaves other labels alone", async () => {
    const tree = await process(
      `<p>${ref("12")} ${ref("a")} ${ref("<em>3</em>")}</p>`,
      { bareFootnotes: false }
    );
    const refs = findElements(tree, "a");
    expect(refs.map(textOf)).toEqual(["[12]", "a", ""]);
    expect(findFirstElement(tree, "em")?.children).toMatchObject([
      { value: "3" },
    ]);
  });

  it("keeps a repeated back-link's own text (↩ with its count)", async () => {
    const tree = await process(
      '<section data-footnotes=""><ol><li id="user-content-fn-1"><p>b <a href="#user-content-fnref-1" data-footnote-backref="">↩</a> <a href="#user-content-fnref-1-2" data-footnote-backref="">↩<sup>2</sup></a></p></li></ol></section>'
    );
    const [first, second] = findElements(tree, "a");
    expect(textOf(first!)).toBe("↩︎");
    expect(second!.children).toMatchObject([
      { type: "text", value: "↩" },
      { type: "element", tagName: "sup" },
    ]);
  });

  it("removes all the whitespace before the back-link", async () => {
    const tree = await process(
      '<section data-footnotes=""><ol><li id="user-content-fn-1"><p>body  \n <a href="#user-content-fnref-1" data-footnote-backref="">↩</a></p></li></ol></section>'
    );
    expect(findFirstElement(tree, "p")?.children[0]).toMatchObject({
      value: "body",
    });
  });

  it("keeps other aria-describedby ids when the heading goes", async () => {
    const tree = await process(
      `<p>${ref("1", "footnote-label note-1")}</p>` +
        '<section data-footnotes=""><h2 id="footnote-label">Footnotes</h2><ol><li id="user-content-fn-1"><p>b</p></li></ol></section>',
      { footnoteHeading: false, bareFootnotes: false }
    );
    expect(findFirstElement(tree, "a")?.properties?.ariaDescribedBy).toEqual([
      "note-1",
    ]);
  });

  it("leaves a section that is not the footnotes alone", async () => {
    const tree = await process(
      '<section><h2 id="x">Other</h2><ol><li id="user-content-fn-1"><p>b</p></li></ol></section>',
      { footnoteHeading: false }
    );
    expect(findFirstElement(tree, "h2")).toBeDefined();
    expect(findElements(tree, "hr")).toEqual([]);
    expect(findFirstElement(tree, "li")?.properties?.dataFootnoteId).toBe(
      undefined
    );
  });

  it("unwraps only an inline footnote holding a single paragraph", async () => {
    const tree = await process(
      '<section data-footnotes=""><ol>' +
        '<li id="user-content-fn-inline-footnote-1"><p>a</p><p>b</p></li>' +
        '<li id="user-content-fn-not-inline-footnote-x"><p>c</p></li>' +
        "</ol></section>"
    );
    const [two, named] = findElements(tree, "li");
    expect(findElements({ type: "root", children: [two!] }, "p")).toHaveLength(
      2
    );
    expect(
      findElements({ type: "root", children: [named!] }, "p")
    ).toHaveLength(1);
  });
});

describe("bare footnotes, edge cases", () => {
  it("bares a stray reference anchor that is outside any sup or link", async () => {
    const tree = await process(
      '<p>x <a href="#user-content-fn-q" data-footnote-ref="">1</a> y</p>',
      { footnoteMarkup: false }
    );
    expect(findElements(tree, "a")).toEqual([]);
    expect(findFirstElement(tree, "p")?.children).toMatchObject([
      { value: "x " },
      { value: "q" },
      { value: " y" },
    ]);
  });

  it("leaves links in a sup that are not footnote references", async () => {
    const tree = await process('<p><sup><a href="#missing">1</a></sup></p>');
    expect(findFirstElement(tree, "a")?.properties?.href).toBe("#missing");
  });
});

describe("checkbox, edge cases", () => {
  it("leaves other inputs alone", async () => {
    const tree = await process('<input type="text" disabled>');
    const input = findFirstElement(tree, "input")!;
    expect(input.properties.disabled).toBe(true);
    expect(input.properties.className).toBeUndefined();
  });

  it("marks only task list items, and adds is-checked once", async () => {
    const tree = await process(
      '<ul><li><input type="checkbox" checked> plain</li>' +
        '<li class="task-list-item is-checked"><input type="checkbox" checked> done</li></ul>'
    );
    const [plain, done] = findElements(tree, "li");
    expect(plain!.properties.dataTask).toBeUndefined();
    expect(getClasses(plain!)).toEqual([]);
    expect(getClasses(done!)).toEqual(["task-list-item", "is-checked"]);
    expect(done!.properties.dataTask).toBe("x");
  });
});

describe("mermaid expand controls, markup", () => {
  it("builds the button and the dialog the mermaid script looks for", async () => {
    const tree = await process(
      '<pre><code class="mermaid">graph LR</code></pre>'
    );
    const [button, , container] = findFirstElement(tree, "pre")!
      .children as Element[];
    expect(getClasses(button!)).toEqual(["expand-button"]);
    expect(
      findFirstElement({ type: "root", children: [button!] }, "svg")
    ).toBeDefined();
    const space = container!.children[0] as Element;
    expect(space.properties.id).toBe("mermaid-space");
    expect(getClasses(space.children[0] as Element)).toEqual([
      "mermaid-content",
    ]);
  });

  it("wraps a div.mermaid once even when run again", async () => {
    const tree = await process('<div class="mermaid">graph LR</div>', {
      blockWrappers: false,
    });
    await unified().use(rehypeObsidian, { blockWrappers: false }).run(tree);
    const wrappers = findElements(tree, "div").filter((d) =>
      getClasses(d).includes("mermaid-diagram")
    );
    expect(wrappers).toHaveLength(1);
    expect(findElements(tree, "button")).toHaveLength(1);
  });
});

describe("block wrappers, edge cases", () => {
  const names = (tree: Root) =>
    tree.children
      .filter((c): c is Element => c.type === "element")
      .map((w) => [
        getClasses(w).join("."),
        w.children
          .filter((c): c is Element => c.type === "element")
          .map((c) => c.tagName)
          .join("+"),
      ]);

  it("keeps a note embed with its paragraphs across the newlines between them", async () => {
    const tree = await process(
      '<p></p>\n<div class="transclude">x</div>\n<p></p>\n<p>After</p>'
    );
    expect(names(tree)).toEqual([
      ["el-p", "p+div+p"],
      ["el-p", "p"],
    ]);
  });

  it("wraps an empty paragraph on its own when no embed follows", async () => {
    const tree = await process("<p></p>\n<div>x</div>");
    expect(names(tree)).toEqual([
      ["el-p", "p"],
      ["el-div", "div"],
    ]);
  });

  it("names display maths in a figure or pre el-div", async () => {
    const tree = await process(
      '<figure><pre><code class="language-math">x</code></pre></figure>' +
        '<pre><code class="math-display">x</code></pre>' +
        '<pre><code class="language-js">x</code></pre>'
    );
    expect(names(tree).map(([w]) => w)).toEqual(["el-div", "el-div", "el-pre"]);
  });
});

describe("block references, shields and nesting", () => {
  it("never reads an identifier inside rendered math, SVG, scripts or styles", async () => {
    for (const html of [
      '<p>x <span class="katex">e ^x</span></p>',
      '<p>x <span class="math math-inline">e ^x</span></p>',
      '<p>x <mjx-container class="MathJax">e ^x</mjx-container></p>',
      "<p>x <math><mi>e ^x</mi></math></p>",
      "<p>x <svg><text>t ^x</text></svg></p>",
      "<p>x <script>a ^x</script></p>",
      "<p>x <style>a ^x</style></p>",
    ]) {
      const tree = await process(html);
      expect(findFirstElement(tree, "p")?.properties?.id, html).toBeUndefined();
    }
  });

  it("reads an identifier in other inline wrappers", async () => {
    const tree = await process('<p>x <span class="note">t ^x</span></p>');
    expect(findFirstElement(tree, "p")?.properties?.id).toBe("^x");
  });

  it("leaves a nested list's identifier to the nested item", async () => {
    const tree = await process(
      "<ul><li>outer<ul><li>inner ^in</li></ul></li></ul>"
    );
    const [outer, inner] = findElements(tree, "li");
    expect(inner!.properties.id).toBe("^in");
    expect(outer!.properties.id).toBeUndefined();
  });

  it("keeps file.data's existing blocks", () => {
    const tree = unified()
      .use(rehypeParse, { fragment: true })
      .parse("<p>x ^b</p>");
    const earlier = { type: "element", tagName: "p" } as Element;
    const file: { data?: Record<string, unknown> } = {
      data: { blocks: { a: earlier }, other: 1 },
    };
    blockReferences(tree, file);
    expect(Object.keys(file.data!.blocks as object)).toEqual(["a", "b"]);
    expect(file.data!.other).toBe(1);
    expect(file.data!.htmlAst).toBe(tree);
  });

  it("does not point links that are not same-page block links", async () => {
    const tree = await process(
      '<p>x ^b</p><p><a href="^b">bare</a> <a href="#%E0%A4%A">bad</a></p>'
    );
    expect(findElements(tree, "a").map((a) => a.properties?.href)).toEqual([
      "^b",
      "#%E0%A4%A",
    ]);
  });
});

describe("YouTube embeds, more", () => {
  it("embeds a video in its playlist, as an iframe Quartz styles", async () => {
    const tree = await process(
      '<img src="https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123">'
    );
    const iframe = findFirstElement(tree, "iframe")!;
    expect(iframe.properties).toMatchObject({
      src: "https://www.youtube.com/embed/dQw4w9WgXcQ?list=PL123",
      className: ["external-embed", "youtube"],
      allow: "fullscreen",
    });
    expect(findFirstElement(tree, "img")).toBeUndefined();
  });

  it("needs an 11-character video id or a playlist", async () => {
    const src = "https://www.youtube.com/watch?v=short";
    const tree = await process(`<img src="${src}">`);
    expect(findFirstElement(tree, "iframe")).toBeUndefined();
    expect(findFirstElement(tree, "img")?.properties?.src).toBe(src);
  });
});
