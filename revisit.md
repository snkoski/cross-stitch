# Revisit

Things to come back to: checks not done yet, known problems, and why things were built the way they were. `todo.md` is for new ideas; this file is for loose ends in work that's already landed. Take an item out once it's settled.

## Saving (built 2026-11-01)

A "Save and open" group at the top of the controls saves three kinds of file:

- **PDF**, to print and stitch from: a cover with a preview, the size, the finished size on the chosen fabric, and a color key, then the chart across numbered pages.
- **Image (PNG)**, to share or look at: just the chart, 20 pixels per stitch, with symbols if Show symbols is on. It has no color key, so it isn't enough to stitch from.
- **Pattern file (`.cross-stitch.json`)**, to open again and keep editing: the pattern, its name, and the fabric. It's the only one of the three that can be opened again.

### Still to check

- **Print a PDF on paper.** The pages were checked by rendering them with Poppler (`pdftoppm`), not in Preview or Acrobat, and not printed. Print at 100% scale ("Actual size"), not "Fit to page", and check the squares are big enough to read and the symbols are easy to tell apart.
- **Show the PDF to a stitcher**, such as the friend who asked for it. Check the layout matches what they're used to.
- **Try the downloads in Safari and on a phone.** They were tested in Chromium only. Safari starts a download after the click returns, so the file's URL is kept for a minute; check this works.

### Known problems

- **A fully transparent photo crashes the whole tool.** This came before saving. The photo becomes a pattern with no colors, and drawing the color picker fails on the empty palette. To reproduce, choose a PNG that's completely transparent. It's also listed in `todo.md`.
- **The design system's `.button` doesn't set `box-sizing: border-box`.** It looks right on a real `<button>`, which is border-box by default, but drawn on a `<span>` it's 12px too tall: 44px instead of 32px at the small size. The file pickers here ("Choose a photo" and "Open a pattern file") draw it on a `<span>`, so `src/cross-stitch.css` sets `box-sizing` on `.cross-stitch__file .button` as a workaround. The real fix belongs in the design-system repo. After it's made and the pinned commit is bumped, remove the workaround.
- **Closing the tab loses unsaved work.** Nothing is kept unless a pattern file is saved, and the tool says so under the buttons. Saving in the browser is in `todo.md`.

### Limits, for now

- **The color key lists hex codes, not thread numbers.** It becomes a shopping list once the real thread colors item in `todo.md` is done.
- **The PDF is US Letter only.** It prints on A4, but with uneven margins. A paper choice is in `todo.md`.
- **The page text in the PDF can only use the built-in PDF fonts' characters.** That's roughly Western European. Anything else, such as 家 or emoji, prints as "?" in the title on the page. The file's title in its properties keeps every character.
- **The PDF isn't tagged for screen readers.** A chart is a picture by nature, but the cover and the key could be tagged.
- **The largest pattern makes a big PDF.** At 200 × 200 stitches with 40 colors, it's 13 pages and about 3.4 MB, because the file isn't compressed. Compressing it would make it several times smaller.
- **Text floating on the chart isn't saved.** It isn't part of the pattern until it's added, and a note says so while it floats.

### Why it was built this way

- **Three formats:** each one does a job the others can't. A PDF or an image can't be opened again and edited, and a pattern file is no use away from the tool.
- **A PDF written by hand, with no library:** the PDF format is plain text, and the drawing is only squares, lines, and a few words. A library would still need the symbols drawn by hand, because the built-in PDF fonts don't have ★, ♥, and the other shapes, so it would add weight without saving the hard part. All of it is in `src/pdf.ts` and is unit tested in Node.
- **The PDF layout follows printed charts:** bold numbered lines every 10 stitches, arrows at the center, where stitchers usually start, and labels like "Chart 1 of 12". Large charts split into pages of 60 × 80 new stitches, so each page starts on a bold line. Each page also repeats 2 stitches from the next one, marked with gray bars, to help line up the pages.
- **The key lists only the colors in use, keeping their numbers:** a starter color that's never stitched isn't listed, and color 3 is still called color 3, as it is on screen.
- **A pattern name field:** without one, every download would have the same file name. The name is also the PDF's title.
- **"Save and open" at the top of the controls:** the column is long, and saving is easy to miss at the bottom.
- **Opening a file can be undone, and it stops following a photo:** Undo goes back to the pattern that was there, and the opened pattern isn't redrawn from an old photo.
- **The pattern file is checked before it's opened:** it might be some other file, or one edited by hand. Its size, colors, and every stitch are checked, and a clear message says why it can't be opened.
- **The image is the chart without a key:** it's for sharing and looking at. The PDF is the one to stitch from.
