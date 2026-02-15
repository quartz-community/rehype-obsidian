import type { Element, ElementContent, Root, Text } from "hast";
import rehypeParse from "rehype-parse";
import { unified } from "unified";
import { describe, expect, it } from "vitest";

import rehypeObsidian, { type RehypeObsidianOptions } from "../src/index.js";

const process = (html: string, opts?: RehypeObsidianOptions) => {
  const processor = unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeObsidian, opts);

  return processor.runSync(processor.parse(html)) as Root;
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

describe("rehype-obsidian", () => {
  it("handles block references on paragraphs", () => {
    const tree = process("<p>Some text ^blockId</p>");
    const paragraph = findFirstElement(tree, "p");

    expect(paragraph?.properties?.id).toBe("blockId");

    if (!paragraph) throw new Error("Paragraph not found");
    const textChild = paragraph.children.find(
      (child: ElementContent): child is Text => child.type === "text",
    );
    expect(textChild?.value).toBe("Some text");
  });

  it("replaces YouTube images with embeds", () => {
    const tree = process(
      '<img src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />',
    );
    const iframe = findFirstElement(tree, "iframe");

    expect(iframe).toBeDefined();
    expect(iframe?.properties?.src).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("replaces Twitter images with tweet embeds", () => {
    const tree = process(
      '<img src="https://twitter.com/user/status/1234567890123456789" />' +
        '<img src="https://x.com/another/status/9876543210987654321" />',
    );
    const blockquotes = findElements(tree, "blockquote");

    expect(blockquotes).toHaveLength(2);

    const [first, second] = blockquotes;
    const firstClasses = Array.isArray(first.properties?.className)
      ? first.properties?.className
      : typeof first.properties?.className === "string"
        ? [first.properties?.className]
        : [];
    const secondClasses = Array.isArray(second.properties?.className)
      ? second.properties?.className
      : typeof second.properties?.className === "string"
        ? [second.properties?.className]
        : [];

    expect(firstClasses).toContain("external-embed");
    expect(firstClasses).toContain("twitter");
    expect(secondClasses).toContain("external-embed");
    expect(secondClasses).toContain("twitter");

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

  it("enables checkbox inputs", () => {
    const tree = process('<input type="checkbox" disabled />');
    const input = findFirstElement(tree, "input");

    expect(input?.properties?.disabled).toBe(false);
    expect(input?.properties?.className).toBe("checkbox-toggle");
  });

  it("adds data-task attribute to task list items", () => {
    const tree = process(
      '<ul class="contains-task-list">' +
        '<li class="task-list-item"><input type="checkbox" disabled> unchecked</li>' +
        '<li class="task-list-item"><input type="checkbox" checked disabled> checked with x</li>' +
        "</ul>",
    );

    const items = findElements(tree, "li");
    expect(items).toHaveLength(2);

    const [unchecked, checked] = items;
    const uncheckedClasses = Array.isArray(unchecked.properties?.className)
      ? unchecked.properties?.className
      : typeof unchecked.properties?.className === "string"
        ? [unchecked.properties?.className]
        : [];
    const checkedClasses = Array.isArray(checked.properties?.className)
      ? checked.properties?.className
      : typeof checked.properties?.className === "string"
        ? [checked.properties?.className]
        : [];

    expect(unchecked.properties?.dataTask).toBe("");
    expect(uncheckedClasses).toContain("task-list-item");
    expect(uncheckedClasses).not.toContain("is-checked");

    expect(checked.properties?.dataTask).toBe("x");
    expect(checkedClasses).toContain("task-list-item");
    expect(checkedClasses).toContain("is-checked");
  });

  it("adds mermaid expand controls", () => {
    const tree = process('<pre><code class="mermaid">graph LR</code></pre>');
    const pre = findFirstElement(tree, "pre");

    expect(pre?.children.length).toBe(3);

    const [button, code, container] = pre?.children as Element[];
    expect(button.tagName).toBe("button");
    expect(button.properties?.["aria-label"]).toBe("Expand mermaid diagram");
    expect(code.tagName).toBe("code");
    expect(container.properties?.id).toBe("mermaid-container");
    expect(container.properties?.role).toBe("dialog");
  });

  it("marks obsidian:// links", () => {
    const tree = process(
      '<a href="obsidian://open?vault=Test&file=note">Open</a>',
    );
    const link = findFirstElement(tree, "a");

    const linkClasses = Array.isArray(link?.properties?.className)
      ? link?.properties?.className
      : typeof link?.properties?.className === "string"
        ? [link?.properties?.className]
        : [];

    expect(link?.properties?.href).toBe("obsidian://open?vault=Test&file=note");
    expect(link?.properties?.dataObsidianUri).toBe(
      "obsidian://open?vault=Test&file=note",
    );
    expect(linkClasses).toContain("obsidian-uri");
  });

  it("respects disabled options", () => {
    const tree = process(
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

  it("applies multiple transforms in one pass", () => {
    const tree = process(
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
