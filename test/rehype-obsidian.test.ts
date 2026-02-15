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

    expect(paragraph?.properties?.id).toBe("blockId");

    if (!paragraph) throw new Error("Paragraph not found");
    const textChild = paragraph.children.find(
      (child): child is Text => child.type === "text",
    );
    expect(textChild?.value).toBe("Some text");
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
    expect(input?.properties?.className).toBe("checkbox-toggle");
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
    expect(items[2].properties?.dataTask).toBe(" ");
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
    expect(input?.properties?.className).toBe("checkbox-toggle");
    expect(iframe?.properties?.src).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
    expect(pre?.children.length).toBe(3);
  });
});
