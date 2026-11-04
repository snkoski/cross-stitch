/* Drawing a pattern as a chart on a canvas: on the page, and as an image to save. */
import { inkFor, SYMBOLS, toCss } from "./pattern";
import type { Pattern } from "./pattern";

/** The fabric between stitches */
const FABRIC = "rgb(251 250 246)";
/** Symbols need this much room to read */
export const SMALLEST_SYMBOL_STITCH = 10;
/** Pixels per stitch in a saved image: big enough to zoom in on, and 4001 pixels across at the largest pattern */
const IMAGE_STITCH = 20;

type DrawStitch = (column: number, row: number, cell: number | null) => void;

/**
 * Draws the fabric, the stitches, and the grid. `extra` can draw more stitches over the pattern, under the grid, such
 * as text that hasn't been added yet.
 */
export function drawChart(context: CanvasRenderingContext2D, { columns, rows, cells, palette }: Pattern, stitchSize: number, showSymbols: boolean, extra?: (drawStitch: DrawStitch) => void) {
  const [width, height] = [columns * stitchSize + 1, rows * stitchSize + 1];
  context.fillStyle = FABRIC;
  context.fillRect(0, 0, width, height);
  const symbols = showSymbols && stitchSize >= SMALLEST_SYMBOL_STITCH;
  context.font = `600 ${Math.round(stitchSize * 0.62)}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const drawStitch: DrawStitch = (column, row, cell) => {
    const [x, y] = [column * stitchSize, row * stitchSize];
    context.fillStyle = cell === null ? FABRIC : toCss(palette[cell]!);
    context.fillRect(x, y, stitchSize, stitchSize);
    if (symbols && cell !== null) {
      context.fillStyle = inkFor(palette[cell]!);
      context.fillText(SYMBOLS[cell]!, x + stitchSize / 2, y + stitchSize / 2 + 1);
    }
  };
  cells.forEach((cell, index) => {
    if (cell !== null) drawStitch(index % columns, Math.floor(index / columns), cell);
  });
  extra?.(drawStitch);

  // Grid lines, with every tenth darker, as printed charts have, for counting
  for (const [count, horizontal] of [[columns, false], [rows, true]] as const) {
    for (let i = 0; i <= count; i++) {
      const tenth = i % 10 === 0;
      context.strokeStyle = tenth ? "rgb(0 0 0 / 55%)" : "rgb(0 0 0 / 16%)";
      context.lineWidth = tenth ? 1.5 : 1;
      context.beginPath();
      const at = i * stitchSize + 0.5;
      if (horizontal) {
        context.moveTo(0, at);
        context.lineTo(width, at);
      } else {
        context.moveTo(at, 0);
        context.lineTo(at, height);
      }
      context.stroke();
    }
  }
}

/** The chart as a PNG */
export function chartImage(pattern: Pattern, showSymbols: boolean): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = pattern.columns * IMAGE_STITCH + 1;
  canvas.height = pattern.rows * IMAGE_STITCH + 1;
  drawChart(canvas.getContext("2d")!, pattern, IMAGE_STITCH, showSymbols);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The image couldn't be made."))), "image/png"));
}
