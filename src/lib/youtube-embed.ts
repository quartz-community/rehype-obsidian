import type { Element, Parent, Root } from "hast";
import { visit } from "unist-util-visit";

const youTubeVideoRegex =
  /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
const youTubePlaylistRegex = /[?&]list=([^#?&]*)/;

/**
 * Hosts whose URLs are YouTube videos or playlists. The patterns above only look at the path, so
 * without this an image such as `https://pub-x.r2.dev/Sisifo.webp` (`v/` and an 11-character
 * name) became a YouTube embed.
 */
const youTubeHostRegex =
  /^(?:(?:www|m|music)\.)?(?:youtube\.com|youtube-nocookie\.com)$|^youtu\.be$/;

/** Whether a URL (`https://…`, `http://…` or `//…`) is on YouTube. */
export const isYouTubeUrl = (src: string): boolean => {
  let url: URL;
  try {
    url = new URL(src.startsWith("//") ? `https:${src}` : src);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  return youTubeHostRegex.test(url.hostname.toLowerCase());
};

const isElement = (node: unknown): node is Element =>
  typeof node === "object" &&
  node !== null &&
  (node as Element).type === "element";

const isParent = (node: unknown): node is Parent =>
  typeof node === "object" &&
  node !== null &&
  Array.isArray((node as Parent).children);

export const youTubeEmbed = (tree: Root) => {
  visit(
    tree,
    "element",
    (node: Element, index: number | undefined, parent: Parent | undefined) => {
      if (!isElement(node) || node.tagName !== "img") return;
      if (!node.properties) return;

      const src = node.properties.src;
      if (typeof src !== "string" || !isYouTubeUrl(src)) return;

      const videoMatch = src.match(youTubeVideoRegex);
      const playlistMatch = src.match(youTubePlaylistRegex);
      const playlistId = playlistMatch?.[1];
      const videoId = videoMatch?.[2];

      const validVideoId =
        videoId && videoId.length === 11 ? videoId : undefined;
      if (!validVideoId && !playlistId) return;

      let iframeSrc: string;
      if (validVideoId && playlistId) {
        iframeSrc = `https://www.youtube.com/embed/${validVideoId}?list=${playlistId}`;
      } else if (validVideoId) {
        iframeSrc = `https://www.youtube.com/embed/${validVideoId}`;
      } else {
        iframeSrc = `https://www.youtube.com/embed/videoseries?list=${playlistId}`;
      }

      const iframe: Element = {
        type: "element",
        tagName: "iframe",
        properties: {
          className: ["external-embed", "youtube"],
          allow: "fullscreen",
          frameBorder: "0",
          width: "600px",
          src: iframeSrc,
        },
        children: [],
      };

      if (!isParent(parent) || typeof index !== "number") return;
      parent.children[index] = iframe;
    },
  );
};
