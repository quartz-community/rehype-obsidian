// src/lib/block-references.ts
import { visit } from "unist-util-visit";
var blockReferenceRegex = /\^([-_A-Za-z0-9]+)$/;
var inlineTagTypes = /* @__PURE__ */ new Set(["p", "li"]);
var blockTagTypes = /* @__PURE__ */ new Set(["blockquote"]);
var isElement = (node) => typeof node === "object" && node !== null && node.type === "element";
var isText = (node) => typeof node === "object" && node !== null && node.type === "text";
var isParent = (node) => typeof node === "object" && node !== null && Array.isArray(node.children);
var ensureFileData = (file) => {
  if (!file.data) {
    file.data = {};
  }
  const data = file.data;
  if (!data.blocks) {
    data.blocks = {};
  }
  return data;
};
var applyBlockId = (node, blockId, blocks) => {
  if (!node.properties) {
    node.properties = {};
  }
  node.properties.id = blockId;
  blocks[blockId] = node;
};
var blockReferences = (tree, file) => {
  const data = ensureFileData(file);
  const blocks = data.blocks;
  visit(
    tree,
    "element",
    (node, index, parent) => {
      if (!isElement(node)) return;
      if (blockTagTypes.has(node.tagName)) {
        if (!isParent(parent) || typeof index !== "number") return;
        const siblingIndex = index + 2;
        const sibling = parent.children[siblingIndex];
        if (!isElement(sibling) || sibling.tagName !== "p") return;
        const firstChild = sibling.children[0];
        if (!isText(firstChild)) return;
        const match2 = firstChild.value.match(blockReferenceRegex);
        if (!match2) return;
        const blockId2 = match2[1];
        parent.children.splice(siblingIndex, 1);
        applyBlockId(node, blockId2, blocks);
        return;
      }
      if (!inlineTagTypes.has(node.tagName)) return;
      const children = node.children;
      if (!children || children.length === 0) return;
      const lastChild = children[children.length - 1];
      if (!isText(lastChild)) return;
      const match = lastChild.value.match(blockReferenceRegex);
      if (!match) return;
      const blockId = match[1];
      const stripped = lastChild.value.replace(blockReferenceRegex, "").trimEnd();
      if (stripped.length === 0) {
        children.pop();
        if (isParent(parent)) {
          for (let i = (index ?? 0) - 1; i >= 0; i -= 1) {
            const sibling = parent.children[i];
            if (isElement(sibling)) {
              applyBlockId(sibling, blockId, blocks);
              return;
            }
          }
        }
        applyBlockId(node, blockId, blocks);
        return;
      }
      lastChild.value = stripped;
      applyBlockId(node, blockId, blocks);
    }
  );
  data.htmlAst = tree;
};

// src/lib/checkbox.ts
import { visit as visit2 } from "unist-util-visit";
var isElement2 = (node) => typeof node === "object" && node !== null && node.type === "element";
var checkbox = (tree) => {
  visit2(tree, "element", (node) => {
    if (!isElement2(node) || node.tagName !== "input") return;
    if (!node.properties || node.properties.type !== "checkbox") return;
    const properties = node.properties;
    const checked = properties.checked;
    node.properties = {
      ...properties,
      checked,
      disabled: false,
      className: "checkbox-toggle"
    };
  });
  visit2(tree, "element", (node) => {
    if (!isElement2(node) || node.tagName !== "li") return;
    if (!node.properties) return;
    const className = node.properties.className;
    const classList = Array.isArray(className) ? className : typeof className === "string" ? [className] : [];
    if (!classList.includes("task-list-item")) return;
    const checkboxInput = node.children.find(
      (child) => isElement2(child) && child.tagName === "input" && child.properties?.type === "checkbox"
    );
    if (!checkboxInput) return;
    const checked = Boolean(checkboxInput.properties?.checked);
    const nextClassList = checked && !classList.includes("is-checked") ? [...classList, "is-checked"] : classList;
    node.properties = {
      ...node.properties,
      className: nextClassList,
      dataTask: checked ? "x" : ""
    };
  });
};

// src/lib/mermaid-expand.ts
import { visit as visit3 } from "unist-util-visit";
var isElement3 = (node) => typeof node === "object" && node !== null && node.type === "element";
var isParent2 = (node) => typeof node === "object" && node !== null && Array.isArray(node.children);
var hasClassName = (node, className) => {
  const classes = node.properties?.className;
  if (Array.isArray(classes)) {
    return classes.includes(className);
  }
  if (typeof classes === "string") {
    return classes.split(/\s+/).includes(className);
  }
  return false;
};
var expandButton = () => ({
  type: "element",
  tagName: "button",
  properties: {
    className: ["expand-button"],
    "aria-label": "Expand mermaid diagram",
    "data-view-component": true
  },
  children: [
    {
      type: "element",
      tagName: "svg",
      properties: {
        width: 16,
        height: 16,
        viewBox: "0 0 16 16",
        fill: "currentColor"
      },
      children: [
        {
          type: "element",
          tagName: "path",
          properties: {
            d: "M3.72 3.72a.75.75 0 011.06 1.06L2.56 7h10.88l-2.22-2.22a.75.75 0 011.06-1.06l3.5 3.5a.75.75 0 010 1.06l-3.5 3.5a.75.75 0 11-1.06-1.06l2.22-2.22H2.56l2.22 2.22a.75.75 0 11-1.06 1.06l-3.5-3.5a.75.75 0 010-1.06l3.5-3.5z"
          },
          children: []
        }
      ]
    }
  ]
});
var mermaidContainer = () => ({
  type: "element",
  tagName: "div",
  properties: { id: "mermaid-container", role: "dialog" },
  children: [
    {
      type: "element",
      tagName: "div",
      properties: { id: "mermaid-space" },
      children: [
        {
          type: "element",
          tagName: "div",
          properties: { className: ["mermaid-content"] },
          children: []
        }
      ]
    }
  ]
});
var mermaidExpand = (tree) => {
  visit3(
    tree,
    "element",
    (node, _index, parent) => {
      if (!isElement3(node) || node.tagName !== "code") return;
      if (!hasClassName(node, "mermaid")) return;
      if (!isParent2(parent)) return;
      parent.children = [expandButton(), node, mermaidContainer()];
    }
  );
};

// src/lib/youtube-embed.ts
import { visit as visit4 } from "unist-util-visit";
var youTubeVideoRegex = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
var youTubePlaylistRegex = /[?&]list=([^#?&]*)/;
var isElement4 = (node) => typeof node === "object" && node !== null && node.type === "element";
var isParent3 = (node) => typeof node === "object" && node !== null && Array.isArray(node.children);
var youTubeEmbed = (tree) => {
  visit4(
    tree,
    "element",
    (node, index, parent) => {
      if (!isElement4(node) || node.tagName !== "img") return;
      if (!node.properties) return;
      const src = node.properties.src;
      if (typeof src !== "string") return;
      const videoMatch = src.match(youTubeVideoRegex);
      const playlistMatch = src.match(youTubePlaylistRegex);
      const playlistId = playlistMatch?.[1];
      const videoId = videoMatch?.[2];
      const validVideoId = videoId && videoId.length === 11 ? videoId : void 0;
      if (!validVideoId && !playlistId) return;
      let iframeSrc;
      if (validVideoId && playlistId) {
        iframeSrc = `https://www.youtube.com/embed/${validVideoId}?list=${playlistId}`;
      } else if (validVideoId) {
        iframeSrc = `https://www.youtube.com/embed/${validVideoId}`;
      } else {
        iframeSrc = `https://www.youtube.com/embed/videoseries?list=${playlistId}`;
      }
      const iframe = {
        type: "element",
        tagName: "iframe",
        properties: {
          className: ["external-embed", "youtube"],
          allow: "fullscreen",
          frameBorder: 0,
          width: "600px",
          src: iframeSrc
        },
        children: []
      };
      if (!isParent3(parent) || typeof index !== "number") return;
      parent.children[index] = iframe;
    }
  );
};

// src/index.ts
var defaultOptions = {
  blockReferences: true,
  youTubeEmbed: true,
  checkbox: true,
  mermaid: true
};
function rehypeObsidian(userOpts) {
  const opts = { ...defaultOptions, ...userOpts };
  return (tree, file) => {
    if (opts.blockReferences) blockReferences(tree, file);
    if (opts.youTubeEmbed) youTubeEmbed(tree);
    if (opts.checkbox) checkbox(tree);
    if (opts.mermaid) mermaidExpand(tree);
  };
}
export {
  blockReferences,
  checkbox,
  rehypeObsidian as default,
  mermaidExpand,
  youTubeEmbed
};
//# sourceMappingURL=index.js.map