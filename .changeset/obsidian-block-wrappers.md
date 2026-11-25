---
"@quartz-community/rehype-obsidian": minor
---

Each top-level block of a note is wrapped in the div Obsidian's reading view puts it in (`div.el-p > p`, `div.el-h2 > h2`, `div.el-pre` around code blocks and diagrams, `div.el-div` around callouts and display maths, `div.el-section` around the footnotes). Themes space blocks with these wrappers, and their `:first-child` / `:last-child` rules match each block in its own wrapper; 145 registry themes style them. The wrappers have no styles of their own, so sites without a theme look the same. Runs after the other steps, and leaves an already wrapped tree alone. Turn off with `blockWrappers: false`; `isBlockWrapper` is exported for code that walks a note's top-level blocks.
