/*
 * A pattern as a PDF to print and stitch from: a cover with a preview and the color key, then the chart across as many
 * pages as it needs, laid out the way printed charts are. The PDF is written by hand: the format is plain text, the
 * drawing is only squares, lines, and a few words, and a library would still need the symbols drawn by hand, because
 * PDF's built-in fonts don't have them. No DOM, so it's unit tested.
 */
import { inkFor, stitchCounts, SYMBOLS, toHex } from "./pattern";
import type { Pattern, Rgb } from "./pattern";

const [PAGE_WIDTH, PAGE_HEIGHT, MARGIN] = [612, 792, 36]; // US Letter, in points (72 to the inch)

// Each chart page has this many new stitches, and repeats a little of the next page so the two can be lined up.
// Stepping by 60 and 80 means every page starts on a bold line.
const [STEP_ACROSS, STEP_DOWN, OVERLAP] = [60, 80, 2];

const GRID_LEFT = 60;
const GRID_TOP = 74;
const GRID_WIDTH = PAGE_WIDTH - MARGIN - GRID_LEFT;
const GRID_HEIGHT = PAGE_HEIGHT - MARGIN - GRID_TOP - 14;
/** A small chart can be drawn bigger, but not so big that it stops looking like a chart */
const LARGEST_STITCH = 14;

export interface PdfDetails {
  name: string;
  fabricCount: number;
}

/** The stitches on one page of the chart, counted from 0 */
export interface ChartPage {
  column: number;
  row: number;
  columns: number;
  rows: number;
}

/** Where each page starts and how much it holds, along one direction */
function spans(count: number, step: number) {
  const result: { start: number; size: number }[] = [];
  for (let start = 0; ; start += step) {
    const size = Math.min(count - start, step + OVERLAP);
    result.push({ start, size });
    if (start + size === count) return result;
  }
}

/** How a chart is divided into pages, across and then down, as you'd read them */
export function chartPages(columns: number, rows: number): ChartPage[] {
  return spans(rows, STEP_DOWN).flatMap(({ start: row, size: rowCount }) =>
    spans(columns, STEP_ACROSS).map(({ start: column, size: columnCount }) => ({ column, row, columns: columnCount, rows: rowCount })),
  );
}

// --- PDF drawing --------------------------------------------------------------------------------------------------

const num = (value: number) => String(Math.round(value * 1000) / 1000);
/** Measured from the top of the page, as the layout is; PDF measures from the bottom */
const fromTop = (top: number) => PAGE_HEIGHT - top;
const rgbOf = ([r, g, b]: Rgb) => `${num(r / 255)} ${num(g / 255)} ${num(b / 255)}`;

/** Characters outside Latin-1 that PDF's built-in fonts have, at the codes they use */
const WIN_ANSI: Record<string, number> = { "€": 0x80, "‚": 0x82, "„": 0x84, "…": 0x85, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97 };

/** Text as a PDF string in the built-in fonts' encoding. Characters they don't have become question marks. */
function pdfString(text: string) {
  let result = "";
  for (const character of text) {
    const code = WIN_ANSI[character] ?? character.codePointAt(0)!;
    if (character === "(" || character === ")" || character === "\\") result += `\\${character}`;
    else if (code >= 0x20 && code < 0x7f) result += character;
    else if (WIN_ANSI[character] || (code >= 0xa0 && code <= 0xff)) result += `\\${code.toString(8).padStart(3, "0")}`;
    else result += "?";
  }
  return `(${result})`;
}

const write = (x: number, top: number, size: number, text: string, bold = false) => `BT /${bold ? "Bold" : "Regular"} ${num(size)} Tf ${num(x)} ${num(fromTop(top))} Td ${pdfString(text)} Tj ET`;
const line = (x1: number, y1: number, x2: number, y2: number) => `${num(x1)} ${num(fromTop(y1))} m ${num(x2)} ${num(fromTop(y2))} l S`;
const box = (x: number, top: number, width: number, height: number) => `${num(x)} ${num(fromTop(top + height))} ${num(width)} ${num(height)} re`;
const polygon = (points: [number, number][]) => `${points.map(([x, y], index) => `${num(x)} ${num(y)} ${index === 0 ? "m" : "l"}`).join(" ")} h`;

// --- The symbols, each drawn once in a square one unit wide and used for every stitch ------------------------------

function circlePath(r: number) {
  const [c, k] = [0.5, r * 0.5523];
  const [a, b] = [c - r, c + r];
  return `${num(c)} ${num(b)} m ${num(c + k)} ${num(b)} ${num(b)} ${num(c + k)} ${num(b)} ${num(c)} c ${num(b)} ${num(c - k)} ${num(c + k)} ${num(a)} ${num(c)} ${num(a)} c ${num(c - k)} ${num(a)} ${num(a)} ${num(c - k)} ${num(a)} ${num(c)} c ${num(a)} ${num(c + k)} ${num(c - k)} ${num(b)} ${num(c)} ${num(b)} c h`;
}

const SQUARE = polygon([[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8]]);
const TRIANGLE = polygon([[0.5, 0.84], [0.84, 0.2], [0.16, 0.2]]);
const DIAMOND = polygon([[0.5, 0.88], [0.86, 0.5], [0.5, 0.12], [0.14, 0.5]]);
const NARROW_DIAMOND = polygon([[0.5, 0.92], [0.74, 0.5], [0.5, 0.08], [0.26, 0.5]]);
const STAR = polygon(
  Array.from({ length: 10 }, (_, index): [number, number] => {
    const [radius, angle] = [index % 2 === 0 ? 0.44 : 0.18, Math.PI / 2 + (index * Math.PI) / 5];
    return [0.5 + radius * Math.cos(angle), 0.48 + radius * Math.sin(angle)];
  }),
);
const HEART = "0.5 0.14 m 0.08 0.46 0.14 0.84 0.34 0.84 c 0.42 0.84 0.47 0.78 0.5 0.7 c 0.53 0.78 0.58 0.84 0.66 0.84 c 0.86 0.84 0.92 0.46 0.5 0.14 c h";

const filled = (path: string) => `${path} f`;
const outlined = (path: string) => `0.09 w ${path} S`;

/** PDF's built-in fonts don't have these symbols, so they're drawn */
const SHAPES: Record<string, string> = {
  "●": filled(circlePath(0.32)),
  "■": filled(SQUARE),
  "▲": filled(TRIANGLE),
  "◆": filled(DIAMOND),
  "★": filled(STAR),
  "♥": filled(HEART),
  "○": outlined(circlePath(0.3)),
  "□": outlined(SQUARE),
  "△": outlined(TRIANGLE),
  "◇": outlined(DIAMOND),
  "☆": outlined(STAR),
  "♦": filled(NARROW_DIAMOND),
};

/** How wide Helvetica Bold's characters are, in thousandths of its size, to center them in a stitch */
const BOLD_WIDTHS: Record<string, number> = {
  "+": 584, "×": 584, "/": 278, "\\": 278, "=": 584, "#": 556, "%": 889, "@": 975, "&": 722, S: 667, Z: 611, N: 722, H: 722, V: 667, O: 778, T: 611,
  L: 611, C: 722, U: 722, Y: 667, K: 722, M: 833, W: 944, E: 667, A: 722, D: 722, P: 667, R: 722,
};

function symbolDrawing(symbol: string) {
  const shape = SHAPES[symbol];
  if (shape) return shape;
  const size = 0.72;
  return `BT /Bold ${size} Tf ${num(0.5 - (BOLD_WIDTHS[symbol]! / 2000) * size)} 0.24 Td ${pdfString(symbol)} Tj ET`;
}

/** One symbol in a stitch, in the ink that reads on its color */
function drawSymbol(index: number, color: Rgb, x: number, top: number, size: number) {
  const ink = inkFor(color) === "black" ? 0 : 1;
  return `q ${num(size)} 0 0 ${num(size)} ${num(x)} ${num(fromTop(top + size))} cm ${ink} g ${ink} G /Symbol${index} Do Q`;
}

// --- The pages ----------------------------------------------------------------------------------------------------

function footer(page: number, total: number) {
  return `0 g ${write(MARGIN, PAGE_HEIGHT - 20, 8, `Page ${page} of ${total}`)}`;
}

/** The whole pattern, small: each row's runs of one color, drawn as one rectangle */
function drawPreview({ columns, rows, cells, palette }: Pattern, x: number, top: number, stitch: number) {
  const ops = [`0.984 0.98 0.965 rg ${box(x, top, columns * stitch, rows * stitch)} f`];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; ) {
      const cell = cells[row * columns + column]!;
      let end = column + 1;
      while (end < columns && cells[row * columns + end] === cell) end++;
      if (cell !== null) ops.push(`${rgbOf(palette[cell]!)} rg ${box(x + column * stitch, top + row * stitch, (end - column) * stitch, stitch)} f`);
      column = end;
    }
  }
  ops.push(`0.5 G 0.5 w ${box(x, top, columns * stitch, rows * stitch)} S`);
  return ops.join("\n");
}

const plural = (count: number, one: string, many = `${one}s`) => `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

function coverPage(pattern: Pattern, { name, fabricCount }: PdfDetails, chartPageCount: number, totalPages: number) {
  const { columns, rows, palette } = pattern;
  const counts = stitchCounts(pattern);
  const used = palette.map((_, index) => index).filter((index) => counts[index]! > 0);
  const total = counts.reduce((sum, count) => sum + count, 0);
  const [wide, tall] = [columns / fabricCount, rows / fabricCount];
  const title = name.trim() || "Cross stitch pattern";
  const titleSize = Math.min(22, (PAGE_WIDTH - 2 * MARGIN) / (title.length * 0.6));

  const ops = [
    `0 g ${write(MARGIN, MARGIN + 18, titleSize, title, true)}`,
    write(MARGIN, 76, 11, `${columns} × ${rows} stitches. ${plural(total, "stitch", "stitches")} in ${plural(used.length, "color")}.`),
    write(MARGIN, 92, 11, `Finished size on ${fabricCount}-count Aida: ${wide.toFixed(1)} × ${tall.toFixed(1)} in (${(wide * 2.54).toFixed(1)} × ${(tall * 2.54).toFixed(1)} cm).`),
    write(MARGIN, 108, 11, `The chart is on ${plural(chartPageCount, "page")}. The arrows at its edges mark the center, a good place to start.`),
  ];

  const previewTop = 124;
  const previewStitch = Math.min(240 / rows, (PAGE_WIDTH - 2 * MARGIN) / columns, 8);
  ops.push(drawPreview(pattern, MARGIN, previewTop, previewStitch));

  // The color key: two columns once it doesn't fit in one
  const keyTop = previewTop + rows * previewStitch + 30;
  const rowHeight = 15;
  const perColumn = Math.max(1, Math.floor((PAGE_HEIGHT - MARGIN - 20 - keyTop) / rowHeight));
  const inColumn = used.length > perColumn ? Math.ceil(used.length / 2) : perColumn;
  ops.push(`0 g ${write(MARGIN, keyTop - 6, 13, "Color key", true)}`);
  if (used.length === 0) ops.push(write(MARGIN, keyTop + 12, 10, "No stitches yet."));
  used.forEach((index, position) => {
    const x = MARGIN + (position >= inColumn ? 270 : 0);
    const top = keyTop + (position % inColumn) * rowHeight;
    const color = palette[index]!;
    ops.push(
      `${rgbOf(color)} rg ${box(x, top, 13, 13)} f 0.5 G 0.5 w ${box(x, top, 13, 13)} S`,
      drawSymbol(index, color, x, top, 13),
      `0 g ${write(x + 20, top + 10, 10, `Color ${index + 1}`)}`,
      write(x + 80, top + 10, 10, toHex(color)),
      write(x + 140, top + 10, 10, plural(counts[index]!, "stitch", "stitches")),
    );
  });
  ops.push(footer(1, totalPages));
  return ops.join("\n");
}

function chartPage(pattern: Pattern, page: ChartPage, position: number, chartPageCount: number, totalPages: number) {
  const { columns, rows, cells, palette } = pattern;
  const stitch = chartPageCount === 1 ? Math.min(LARGEST_STITCH, GRID_WIDTH / page.columns, GRID_HEIGHT / page.rows) : Math.min(GRID_WIDTH / (STEP_ACROSS + OVERLAP), GRID_HEIGHT / (STEP_DOWN + OVERLAP));
  const [width, height] = [page.columns * stitch, page.rows * stitch];
  const xOf = (column: number) => GRID_LEFT + (column - page.column) * stitch;
  const topOf = (row: number) => GRID_TOP + (row - page.row) * stitch;

  const ops = [`0 g ${write(MARGIN, 44, 12, `Chart ${position} of ${chartPageCount}: columns ${page.column + 1} to ${page.column + page.columns}, rows ${page.row + 1} to ${page.row + page.rows}`, true)}`];

  // The stitches, one color at a time, then their symbols, so the file stays small
  const onPage: { cell: number; column: number; row: number }[] = [];
  for (let row = page.row; row < page.row + page.rows; row++) {
    for (let column = page.column; column < page.column + page.columns; column++) {
      const cell = cells[row * columns + column]!;
      if (cell !== null) onPage.push({ cell, column, row });
    }
  }
  palette.forEach((color, index) => {
    const boxes = onPage.filter(({ cell }) => cell === index).map(({ column, row }) => box(xOf(column), topOf(row), stitch, stitch));
    if (boxes.length > 0) ops.push(`${rgbOf(color)} rg ${boxes.join(" ")} f`);
  });
  for (const { cell, column, row } of onPage) ops.push(drawSymbol(cell, palette[cell]!, xOf(column), topOf(row), stitch));

  // Grid lines, with every tenth darker and numbered, counting from the whole pattern's top left
  ops.push("0.72 G 0.25 w");
  for (let i = 0; i <= page.columns; i++) if ((page.column + i) % 10 !== 0) ops.push(line(xOf(page.column + i), GRID_TOP, xOf(page.column + i), GRID_TOP + height));
  for (let i = 0; i <= page.rows; i++) if ((page.row + i) % 10 !== 0) ops.push(line(GRID_LEFT, topOf(page.row + i), GRID_LEFT + width, topOf(page.row + i)));
  ops.push("0 G 0.9 w 0 g");
  for (let i = 0; i <= page.columns; i++) {
    const at = page.column + i;
    if (at % 10 !== 0) continue;
    ops.push(line(xOf(at), GRID_TOP, xOf(at), GRID_TOP + height));
    if (at > 0) ops.push(write(xOf(at) - String(at).length * 1.668, GRID_TOP - 3, 6, String(at)));
  }
  for (let i = 0; i <= page.rows; i++) {
    const at = page.row + i;
    if (at % 10 !== 0) continue;
    ops.push(line(GRID_LEFT, topOf(at), GRID_LEFT + width, topOf(at)));
    if (at > 0) ops.push(write(GRID_LEFT - 3 - String(at).length * 3.336, topOf(at) + 2, 6, String(at)));
  }
  ops.push(`${box(GRID_LEFT, GRID_TOP, width, height)} S`);

  // Arrows at the center, on the pages it falls on. On an odd count, the center is the middle of a stitch.
  const [centerX, centerTop] = [xOf(columns / 2), topOf(rows / 2)];
  if (columns / 2 >= page.column && columns / 2 <= page.column + page.columns) {
    const [tip, back] = [fromTop(GRID_TOP - 11), fromTop(GRID_TOP - 18)];
    ops.push(`${polygon([[centerX, tip], [centerX + 4, back], [centerX - 4, back]])} f`);
  }
  if (rows / 2 >= page.row && rows / 2 <= page.row + page.rows) {
    const [tip, back] = [GRID_LEFT - 15, GRID_LEFT - 22];
    ops.push(`${polygon([[tip, fromTop(centerTop)], [back, fromTop(centerTop) + 4], [back, fromTop(centerTop) - 4]])} f`);
  }

  // Gray bars outside the grid mark what's repeated on the next page
  const repeatsAcross = page.column + page.columns < columns;
  const repeatsDown = page.row + page.rows < rows;
  ops.push("0.55 g");
  if (repeatsAcross) ops.push(`${box(xOf(page.column + page.columns - OVERLAP), GRID_TOP + height + 2, OVERLAP * stitch, 3)} f`);
  if (repeatsDown) ops.push(`${box(GRID_LEFT + width + 2, topOf(page.row + page.rows - OVERLAP), 3, OVERLAP * stitch)} f`);
  if (repeatsAcross || repeatsDown) ops.push(`0 g ${write(PAGE_WIDTH - MARGIN - 196, PAGE_HEIGHT - 20, 8, "Gray bars mark stitches repeated on the next page.")}`);

  ops.push(footer(position + 1, totalPages));
  return ops.join("\n");
}

// --- The file -----------------------------------------------------------------------------------------------------

const stream = (dictionary: string, content: string) => `<< ${dictionary} /Length ${content.length} >>\nstream\n${content}\nendstream`;

/** A title for the PDF's properties, which unlike the page text can hold any character */
function utf16Hex(text: string) {
  const units = Array.from({ length: text.length }, (_, index) => text.charCodeAt(index).toString(16).padStart(4, "0"));
  return `<FEFF${units.join("")}>`;
}

export function patternToPdf(pattern: Pattern, details: PdfDetails): Uint8Array<ArrayBuffer> {
  const pages = chartPages(pattern.columns, pattern.rows);
  const totalPages = pages.length + 1;
  const contents = [coverPage(pattern, details, pages.length, totalPages), ...pages.map((page, index) => chartPage(pattern, page, index + 1, pages.length, totalPages))];

  // Object numbers: the first few are fixed, then the symbols, then a page and its content for each page
  const [CATALOG, PAGES, REGULAR, BOLD, RESOURCES, INFO] = [1, 2, 3, 4, 5, 6];
  const firstSymbol = 7;
  const firstPage = firstSymbol + SYMBOLS.length;
  const pageIds = contents.map((_, index) => firstPage + index * 2);

  const usedSymbols = SYMBOLS.map((_, index) => `/Symbol${index} ${firstSymbol + index} 0 R`).join(" ");
  const objects: string[] = [
    `<< /Type /Catalog /Pages ${PAGES} 0 R >>`,
    `<< /Type /Pages /Count ${contents.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    `<< /Font << /Regular ${REGULAR} 0 R /Bold ${BOLD} 0 R >> /XObject << ${usedSymbols} >> >>`,
    `<< /Title ${utf16Hex(details.name.trim() || "Cross stitch pattern")} /Producer (Cross stitch pattern maker) >>`,
    ...SYMBOLS.map((symbol) => stream(`/Type /XObject /Subtype /Form /BBox [0 0 1 1] /Resources << /Font << /Bold ${BOLD} 0 R >> >>`, symbolDrawing(symbol))),
    ...contents.flatMap((content, index) => [
      `<< /Type /Page /Parent ${PAGES} 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources ${RESOURCES} 0 R /Contents ${pageIds[index]! + 1} 0 R >>`,
      stream("", content),
    ]),
  ];

  // Everything is ASCII, so a character is a byte and offsets can be counted on the string
  let file = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => {
    const offset = file.length;
    file += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = file.length;
  file += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`;
  file += `trailer\n<< /Size ${objects.length + 1} /Root ${CATALOG} 0 R /Info ${INFO} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(file, (character) => character.charCodeAt(0));
}
