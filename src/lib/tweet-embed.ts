import type { Element, Parent, Root } from "hast";
import { visit } from "unist-util-visit";
import { fromHtml } from "hast-util-from-html";

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

interface TweetNode {
  index: number;
  parent: Parent;
  url: string;
  user: string;
}

function collectTweetNodes(tree: Root): TweetNode[] {
  const tweets: TweetNode[] = [];

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
      if (!user || !match?.[3]) return;

      if (!isParent(parent) || typeof index !== "number") return;

      tweets.push({ index, parent, url: src, user });
    },
  );

  return tweets;
}

async function fetchOEmbed(
  url: string,
): Promise<{ html: string; author_name: string } | null> {
  const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true&dnt=true`;
  try {
    const response = await fetch(oembedUrl);
    if (!response.ok) return null;
    return (await response.json()) as { html: string; author_name: string };
  } catch {
    return null;
  }
}

function oembedHtmlToHast(html: string): Element {
  const tree = fromHtml(html, { fragment: true });
  const element = tree.children.find(
    (child): child is Element => child.type === "element",
  );
  if (element) return element;

  return {
    type: "element",
    tagName: "div",
    properties: {},
    children: tree.children as Element[],
  };
}

function makeFallbackBlockquote(url: string, user: string): Element {
  return {
    type: "element",
    tagName: "blockquote",
    properties: { className: ["external-embed", "twitter"] },
    children: [
      {
        type: "element",
        tagName: "a",
        properties: { href: url },
        children: [{ type: "text", value: `Tweet by @${user}` }],
      },
    ],
  };
}

export const tweetEmbed = async (tree: Root) => {
  const tweets = collectTweetNodes(tree);
  if (tweets.length === 0) return;

  const results = await Promise.all(
    tweets.map(async (t) => ({
      ...t,
      oembed: await fetchOEmbed(t.url),
    })),
  );

  for (const { index, parent, url, user, oembed } of results) {
    let replacement: Element;

    if (oembed?.html) {
      replacement = oembedHtmlToHast(oembed.html);
      replacement.properties ??= {};
      const existing = Array.isArray(replacement.properties.className)
        ? replacement.properties.className
        : [];
      replacement.properties.className = [
        ...existing,
        "external-embed",
        "twitter",
      ];
    } else {
      replacement = makeFallbackBlockquote(url, user);
    }

    parent.children[index] = replacement;
  }
};
