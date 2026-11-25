---
"@quartz-community/rehype-obsidian": minor
---

Obsidian's fold arrows (`collapseIndicators`): `span.heading-collapse-indicator` opens each of the note's headings, and `span.list-collapse-indicator` each list item with a sublist (after its bullet, before a task's checkbox), with Obsidian's `right-triangle` icon. Themes style and move them. They don't fold anything by themselves, so a site hides them unless it folds headings or lists (Quartz does). Turn off with `collapseIndicators: false`.
