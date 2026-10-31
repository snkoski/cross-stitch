/*
 * Text as stitches: each line is drawn on a canvas in the chosen font, several pixels to a stitch, and a stitch is
 * filled where the letters cover enough of it. The canvas part needs a browser; the rest is plain functions, tested
 * in jsdom.
 */
import type { Mask } from "./pattern";

export interface StitchFont {
  /** The family's name in Google Fonts and in CSS */
  family: string;
  weight: number;
  group: "Stitch alphabets" | "Smooth";
  /**
   * For a pixel font: its pixels to an em, and how many pixels tall its capitals are. Drawn at whole stitches per
   * pixel, every letter lands exactly on the grid, crisp at any size.
   */
  pixels?: { em: number; cap: number };
}

export const FONTS: StitchFont[] = [
  { family: "Silkscreen", weight: 400, group: "Stitch alphabets", pixels: { em: 8, cap: 5 } },
  { family: "Tiny5", weight: 400, group: "Stitch alphabets", pixels: { em: 8, cap: 5 } },
  { family: "Press Start 2P", weight: 400, group: "Stitch alphabets", pixels: { em: 8, cap: 8 } },
  { family: "Nunito", weight: 800, group: "Smooth" },
  { family: "Alfa Slab One", weight: 400, group: "Smooth" },
  { family: "Playfair Display", weight: 700, group: "Smooth" },
  { family: "Pacifico", weight: 400, group: "Smooth" },
  { family: "Dancing Script", weight: 700, group: "Smooth" },
  { family: "Lobster", weight: 400, group: "Smooth" },
  { family: "UnifrakturMaguntia", weight: 400, group: "Smooth" },
];

export type Align = "left" | "center" | "right";

/** How much of a stitch the letters must cover to fill it, for each thickness: less coverage makes bolder letters */
export const THICKNESS = { thin: 0.6, regular: 0.42, thick: 0.22 } as const;
export type Thickness = keyof typeof THICKNESS;

/** Canvas pixels to a stitch, each way: enough to tell how much of a stitch a letter covers */
const SAMPLES = 6;

/** How much of each stitch the letters cover, from 0 to 1, row by row */
export interface Coverage {
  columns: number;
  rows: number;
  cells: number[];
}

// --- Plain functions ------------------------------------------------------------------------------------------

/** Letter heights a font can be drawn at: any for a smooth font, whole stitches per pixel for a pixel font */
export const heightStep = (font: StitchFont) => font.pixels?.cap ?? 1;

/** The nearest height a font can be drawn at */
export const snapHeight = (font: StitchFont, height: number) => Math.max(heightStep(font), Math.round(height / heightStep(font)) * heightStep(font));

/** The stitches a line's letters cover enough of, cut down to just the letters */
export function inkMask(coverage: Coverage, threshold: number): Mask {
  return trim({ columns: coverage.columns, rows: coverage.rows, cells: coverage.cells.map((covered) => covered >= threshold) });
}

/** The smallest mask holding every stitch, or an empty one */
export function trim(mask: Mask): Mask {
  let [left, top, right, bottom] = [Infinity, Infinity, -1, -1];
  mask.cells.forEach((on, index) => {
    if (!on) return;
    const [x, y] = [index % mask.columns, Math.floor(index / mask.columns)];
    [left, top, right, bottom] = [Math.min(left, x), Math.min(top, y), Math.max(right, x), Math.max(bottom, y)];
  });
  if (right < 0) return { columns: 0, rows: 0, cells: [] };
  const [columns, rows] = [right - left + 1, bottom - top + 1];
  const cells: boolean[] = [];
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) cells.push(mask.cells[y * mask.columns + x]!);
  return { columns, rows, cells };
}

/**
 * Lines one under another, lined up on the left, the center, or the right, with a number of bare rows between them.
 * A line with no stitches (an empty line) still takes up its rows, so a blank line between two lines adds space.
 */
export function stackLines(lines: Mask[], align: Align, gap: number): Mask {
  if (lines.length === 0) return { columns: 0, rows: 0, cells: [] };
  const columns = Math.max(...lines.map((line) => line.columns));
  const rows = lines.reduce((sum, line) => sum + line.rows, 0) + gap * (lines.length - 1);
  const cells = Array<boolean>(columns * rows).fill(false);
  let top = 0;
  for (const line of lines) {
    const left = align === "left" ? 0 : align === "right" ? columns - line.columns : Math.floor((columns - line.columns) / 2);
    line.cells.forEach((on, index) => {
      if (on) cells[(top + Math.floor(index / line.columns)) * columns + left + (index % line.columns)] = true;
    });
    top += line.rows + gap;
  }
  return { columns, rows, cells };
}

// --- In the browser -------------------------------------------------------------------------------------------

const css = (font: StitchFont, px: number) => `${font.weight} ${px}px "${font.family}"`;

let stylesheet: Promise<void> | undefined;

/** Adds the Google Fonts stylesheet for every font, once */
function loadStylesheet() {
  stylesheet ??= new Promise((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${FONTS.map((font) => `family=${font.family.replaceAll(" ", "+")}${font.weight === 400 ? "" : `:wght@${font.weight}`}`).join("&")}&display=block`;
    // Offline, the text is still drawn, in a fallback font
    link.onload = link.onerror = () => resolve();
    document.head.append(link);
  });
  return stylesheet;
}

/** Loads a font. False when it couldn't be loaded, and the browser will draw a fallback instead. */
export async function loadFont(font: StitchFont, text: string) {
  await loadStylesheet();
  try {
    await document.fonts.load(css(font, 40), text);
  } catch {
    // A failed download leaves check() false, below
  }
  return document.fonts.check(css(font, 40), text);
}

const capRatios = new Map<string, number>();

/** A smooth font's capital height, as a fraction of its size */
function capRatio(context: CanvasRenderingContext2D, font: StitchFont) {
  let ratio = capRatios.get(font.family);
  if (ratio === undefined) {
    context.font = css(font, 100);
    ratio = context.measureText("H").actualBoundingBoxAscent / 100 || 0.7;
    capRatios.set(font.family, ratio);
  }
  return ratio;
}

/** How much of each stitch one line covers, with its capitals `height` stitches tall and `spacing` bare stitches added between letters */
export function lineCoverage(line: string, font: StitchFont, height: number, spacing: number): Coverage {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const px = font.pixels ? (height / font.pixels.cap) * font.pixels.em * SAMPLES : (height * SAMPLES) / capRatio(context, font);
  const setUp = () => {
    context.font = css(font, px);
    context.letterSpacing = `${spacing * SAMPLES}px`;
    context.textBaseline = "alphabetic";
    context.fillStyle = "black";
  };
  setUp();
  const size = context.measureText(line);
  // A stitch of room on every side, with the start and the baseline on stitch edges, so a pixel font's pixels
  // fall exactly on stitches
  const left = Math.ceil(size.actualBoundingBoxLeft / SAMPLES) + 1;
  const above = Math.ceil(size.actualBoundingBoxAscent / SAMPLES) + 1;
  const columns = left + Math.ceil(Math.max(size.actualBoundingBoxRight, size.width) / SAMPLES) + 1;
  const rows = above + Math.ceil(size.actualBoundingBoxDescent / SAMPLES) + 1;
  canvas.width = columns * SAMPLES;
  canvas.height = rows * SAMPLES;
  setUp(); // Resizing a canvas resets its settings
  context.fillText(line, left * SAMPLES, above * SAMPLES);

  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const cells: number[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      let alpha = 0;
      for (let y = 0; y < SAMPLES; y++) {
        for (let x = 0; x < SAMPLES; x++) alpha += data[((row * SAMPLES + y) * canvas.width + column * SAMPLES + x) * 4 + 3]!;
      }
      cells.push(alpha / (255 * SAMPLES * SAMPLES));
    }
  }
  return { columns, rows, cells };
}

export interface TextSettings {
  font: StitchFont;
  /** How tall capital letters are, in stitches */
  height: number;
  align: Align;
  /** Bare rows between lines */
  lineGap: number;
  /** Bare stitches added between letters */
  spacing: number;
  thickness: Thickness;
}

/** Text as a shape on the grid, one line per line of the text. The font must be loaded first (see loadFont). */
export function textMask(text: string, { font, height, align, lineGap, spacing, thickness }: TextSettings): Mask {
  const lines = text.split("\n").map((line) => {
    // An empty line keeps the height of a line of capitals
    if (!line.trim()) return { columns: 0, rows: height, cells: [] };
    return inkMask(lineCoverage(line, font, height, spacing), THICKNESS[thickness]);
  });
  // Blank lines at the start and end add nothing
  while (lines.length && lines[0]!.columns === 0) lines.shift();
  while (lines.length && lines.at(-1)!.columns === 0) lines.pop();
  return stackLines(lines, align, lineGap);
}
