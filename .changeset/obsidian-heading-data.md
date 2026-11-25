---
"@quartz-community/rehype-obsidian": patch
---

Headings carry Obsidian's `data-heading` attribute (the heading's text), which themes select headings by (`h2[data-heading]`; 31 registry themes, such as ITS's illusion headings). Turn off with `headingData: false`.
