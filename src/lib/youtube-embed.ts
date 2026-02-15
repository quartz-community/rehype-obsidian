import type { Element, Parent, Root } from "hast";
import { visit } from "unist-util-visit";

const youTubeVideoRegex =
  /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
const youTubePlaylistRegex = /[?&]list=([^#?&]*)/;

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
      if (typeof src !== "string") return;

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
          frameBorder: 0,
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
