---
"@quartz-community/rehype-obsidian": patch
---

Block references are read as Obsidian renders them, recorded against Obsidian 1.15.0.

- **Inside emphasis:** an identifier inside emphasis, a highlight or a strikethrough is
  stripped, not only one ending the paragraph's last text. `x **^blk** y` renders an empty
  `strong`, and the last identifier in the block names it, so `x **^blk** ^two` is `two`.
- **In table cells:** an identifier in a table cell is stripped, and names the table.
- **Which `^` counts:** only `^` followed by letters, digits or `-`, at the start of the text
  or after whitespace. `e^x`, `^a_b` and `^a.b` stay as written.
- **After a link or emphasis:** a paragraph ending in an identifier after one
  (`x [l](u) ^blk`) keeps the identifier itself. It used to give it to the block before.
