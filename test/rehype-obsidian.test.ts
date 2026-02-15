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

  it("respects disabled options", () => {
    const tree = process(
      '<p>Keep ^blockId</p><img src="https://www.youtube.com/watch?v=dQw4w9WgXcQ" /><input type="checkbox" disabled />',
      {
        blockReferences: false,
        youTubeEmbed: false,
        checkbox: false,
      },
    );

    const paragraph = findFirstElement(tree, "p");
    const img = findFirstElement(tree, "img");
    const iframe = findFirstElement(tree, "iframe");
    const input = findFirstElement(tree, "input");

    expect(paragraph?.properties?.id).toBeUndefined();
    if (!paragraph) throw new Error("Paragraph not found");
    const textChild = paragraph.children.find(
      (child: ElementContent): child is Text => child.type === "text",
    );
    expect(textChild?.value).toBe("Keep ^blockId");
    expect(img).toBeDefined();
    expect(iframe).toBeUndefined();
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
