/* The pattern itself, and turning a photo into one. No React and no DOM, so all of it can be tested in jsdom. */

/** An sRGB color, each channel 0 to 255 */
export type Rgb = [number, number, number];

export interface Pattern {
  columns: number;
  rows: number;
  /** One per stitch, row by row from the top left: an index into `palette`, or null for bare fabric */
  cells: (number | null)[];
  palette: Rgb[];
}

/** A few thread colors to draw with before any photo is loaded */
export const STARTER_PALETTE: Rgb[] = [
  [33, 33, 36],
  [196, 30, 58],
  [242, 140, 40],
  [250, 205, 60],
  [64, 145, 92],
  [52, 104, 186],
  [128, 84, 160],
  [246, 244, 238],
];

/**
 * Symbols for the chart, one per color, so a pattern still reads when printed in black and white or seen without
 * color. Ordered so the first few, used by the most common colors, are the easiest to tell apart.
 */
export const SYMBOLS = [
  "●", "■", "▲", "◆", "★", "♥", "○", "□", "△", "◇", "☆", "♦", "+", "×", "/", "\\", "=", "#", "%", "@",
  "&", "S", "Z", "N", "H", "V", "O", "T", "L", "C", "U", "Y", "K", "M", "W", "E", "A", "D", "P", "R",
];

/** The most colors a photo can be reduced to; one symbol each */
export const MAX_COLORS = SYMBOLS.length;

/** The smallest and largest a chart can be, in stitches, each way */
export const [MIN_SIZE, MAX_SIZE] = [5, 200];

/** Stitches per inch of the fabrics to choose from */
export const FABRIC_COUNTS = [11, 14, 16, 18];

export function blankPattern(columns: number, rows: number, palette: Rgb[] = STARTER_PALETTE): Pattern {
  return { columns, rows, cells: Array<number | null>(columns * rows).fill(null), palette };
}

/** A new size, keeping what's stitched in the top-left corner where it fits */
export function resizePattern(pattern: Pattern, columns: number, rows: number): Pattern {
  if (columns === pattern.columns && rows === pattern.rows) return pattern;
  const cells = Array<number | null>(columns * rows).fill(null);
  for (let row = 0; row < Math.min(rows, pattern.rows); row++) {
    for (let column = 0; column < Math.min(columns, pattern.columns); column++) {
      cells[row * columns + column] = pattern.cells[row * pattern.columns + column]!;
    }
  }
  return { ...pattern, columns, rows, cells };
}

/** The pattern with one stitch changed, or the same pattern if it was already that */
export function setStitch(pattern: Pattern, column: number, row: number, value: number | null): Pattern {
  if (column < 0 || row < 0 || column >= pattern.columns || row >= pattern.rows) return pattern;
  const index = row * pattern.columns + column;
  if (pattern.cells[index] === value) return pattern;
  const cells = pattern.cells.slice();
  cells[index] = value;
  return { ...pattern, cells };
}

/** Every stitch on the straight line between two stitches, so a fast drag doesn't leave gaps (Bresenham's line) */
export function stitchesBetween(from: [number, number], to: [number, number]): [number, number][] {
  let [x, y] = from;
  const [x1, y1] = to;
  const dx = Math.abs(x1 - x);
  const dy = -Math.abs(y1 - y);
  const sx = x < x1 ? 1 : -1;
  const sy = y < y1 ? 1 : -1;
  let error = dx + dy;
  const points: [number, number][] = [];
  for (;;) {
    points.push([x, y]);
    if (x === x1 && y === y1) return points;
    const twice = 2 * error;
    if (twice >= dy) {
      error += dy;
      x += sx;
    }
    if (twice <= dx) {
      error += dx;
      y += sy;
    }
  }
}

/** A shape on the grid, such as some text: true where it has a stitch, row by row from the top left */
export interface Mask {
  columns: number;
  rows: number;
  cells: boolean[];
}

/**
 * The pattern with a shape stitched in one color, its top-left corner at a stitch, cut off where it runs past the
 * edge. A value of null takes the stitches out instead, cutting the shape out of what's there.
 */
export function stamp(pattern: Pattern, mask: Mask, column: number, row: number, value: number | null): Pattern {
  const cells = pattern.cells.slice();
  mask.cells.forEach((on, index) => {
    const [x, y] = [column + (index % mask.columns), row + Math.floor(index / mask.columns)];
    if (on && x >= 0 && y >= 0 && x < pattern.columns && y < pattern.rows) cells[y * pattern.columns + x] = value;
  });
  return cells.every((cell, index) => cell === pattern.cells[index]) ? pattern : { ...pattern, cells };
}

/** How many stitches use each color in the palette */
export function stitchCounts(pattern: Pattern): number[] {
  const counts = pattern.palette.map(() => 0);
  for (const cell of pattern.cells) if (cell !== null) counts[cell]!++;
  return counts;
}

/** A palette entry as a CSS color */
export const toCss = ([r, g, b]: Rgb) => `rgb(${r} ${g} ${b})`;

/** A palette entry as a hex code, for <input type="color"> and for naming colors */
export const toHex = (rgb: Rgb) => `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;

export function fromHex(hex: string): Rgb {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Whether black or white text reads better on a color, for symbols drawn on stitches */
export const inkFor = (rgb: Rgb) => (relativeLuminance(rgb) > 0.4 ? "black" : "white");

/** Rows that keep a photo's proportions at a given number of stitches across */
export const rowsFor = (width: number, height: number, columns: number) => Math.max(1, Math.round((columns * height) / width));

// --- Color math -------------------------------------------------------------------------------------------------
// Averages are taken in linear light, as the eye mixes it: averaging sRGB numbers directly makes blends too dark.
// Distances are measured in CIELAB, where equal distances look about equally different.

const toLinear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number) => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
};

function relativeLuminance([r, g, b]: Rgb) {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

type Lab = [number, number, number];

function linearToLab([r, g, b]: [number, number, number]): Lab {
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const distance = (a: Lab, b: Lab) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Squared distance: the same order as `distance`, without the square root, for the inner loops */
const distance2 = (a: Lab, b: Lab) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

// --- From a photo to stitches -----------------------------------------------------------------------------------

/** Pixels, as a canvas's getImageData returns them: RGBA, row by row */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray | number[];
}

/**
 * One color per stitch: the average of the pixels that stitch covers, in linear light. A stitch over pixels that
 * are mostly transparent is left as bare fabric (null).
 */
export function sampleImage(pixels: Pixels, columns: number, rows: number): (Rgb | null)[] {
  const colors: (Rgb | null)[] = [];
  for (let row = 0; row < rows; row++) {
    const top = Math.floor((row * pixels.height) / rows);
    const bottom = Math.max(top + 1, Math.floor(((row + 1) * pixels.height) / rows));
    for (let column = 0; column < columns; column++) {
      const left = Math.floor((column * pixels.width) / columns);
      const right = Math.max(left + 1, Math.floor(((column + 1) * pixels.width) / columns));
      let [r, g, b, alpha, count] = [0, 0, 0, 0, 0];
      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
          const i = (y * pixels.width + x) * 4;
          const a = pixels.data[i + 3]! / 255;
          r += toLinear(pixels.data[i]!) * a;
          g += toLinear(pixels.data[i + 1]!) * a;
          b += toLinear(pixels.data[i + 2]!) * a;
          alpha += a;
          count++;
        }
      }
      colors.push(alpha / count < 0.5 ? null : [fromLinear(r / alpha), fromLinear(g / alpha), fromLinear(b / alpha)]);
    }
  }
  return colors;
}

/** Stitches with near-identical colors, grouped so color reduction works on hundreds of colors, not thousands */
interface Bucket {
  /** Sum of the members' linear RGB */
  sum: [number, number, number];
  weight: number;
  lab: Lab;
}

function bucketsOf(colors: (Rgb | null)[]) {
  const byKey = new Map<number, Bucket>();
  const keys: (number | null)[] = colors.map((color) => {
    if (!color) return null;
    // 64 levels per channel: closer than the eye can tell apart in a stitch
    const key = ((color[0] >> 2) << 12) | ((color[1] >> 2) << 6) | (color[2] >> 2);
    const bucket = byKey.get(key) ?? { sum: [0, 0, 0], weight: 0, lab: [0, 0, 0] };
    bucket.sum[0] += toLinear(color[0]);
    bucket.sum[1] += toLinear(color[1]);
    bucket.sum[2] += toLinear(color[2]);
    bucket.weight++;
    byKey.set(key, bucket);
    return key;
  });
  const buckets = [...byKey.values()];
  for (const bucket of buckets) bucket.lab = linearToLab(bucket.sum.map((value) => value / bucket.weight) as [number, number, number]);
  const indexOfKey = new Map([...byKey.keys()].map((key, index) => [key, index]));
  return { buckets, bucketOfStitch: keys.map((key) => (key === null ? null : indexOfKey.get(key)!)) };
}

/**
 * Groups the buckets into at most `count` colors (k-means in CIELAB, weighted by how many stitches each bucket has).
 * It starts from colors spread as far apart as possible, weighted toward common ones, so the result is the same
 * every time and a small bright patch still gets its own color when there are colors to spare.
 */
function cluster(buckets: Bucket[], count: number) {
  const k = Math.min(count, buckets.length);
  const centers: Lab[] = [];
  const heaviest = buckets.reduce((best, bucket) => (bucket.weight > best.weight ? bucket : best), buckets[0]!);
  centers.push(heaviest.lab);
  const nearest = buckets.map((bucket) => distance(bucket.lab, heaviest.lab));
  while (centers.length < k) {
    let pick = 0;
    let score = -1;
    buckets.forEach((bucket, index) => {
      const value = nearest[index]! * Math.sqrt(bucket.weight);
      if (value > score) [pick, score] = [index, value];
    });
    const lab = buckets[pick]!.lab;
    centers.push(lab);
    buckets.forEach((bucket, index) => (nearest[index] = Math.min(nearest[index]!, distance(bucket.lab, lab))));
  }

  const assignment = buckets.map(() => 0);
  for (let round = 0; round < 24; round++) {
    let changed = round === 0;
    buckets.forEach((bucket, index) => {
      let best = 0;
      let bestDistance = distance2(bucket.lab, centers[0]!);
      for (let c = 1; c < centers.length; c++) {
        const d = distance2(bucket.lab, centers[c]!);
        if (d < bestDistance) [best, bestDistance] = [c, d];
      }
      if (best !== assignment[index]) [assignment[index], changed] = [best, true];
    });
    if (!changed) break;
    const sums = centers.map(() => ({ lab: [0, 0, 0] as Lab, weight: 0 }));
    buckets.forEach((bucket, index) => {
      const sum = sums[assignment[index]!]!;
      for (let i = 0; i < 3; i++) sum.lab[i]! += bucket.lab[i]! * bucket.weight;
      sum.weight += bucket.weight;
    });
    sums.forEach((sum, c) => {
      if (sum.weight > 0) centers[c] = sum.lab.map((value) => value / sum.weight) as Lab;
    });
  }
  return { centers, assignment };
}

/**
 * Reduces a photo's stitches to at most `count` colors. Each color in the palette is the average, in linear light, of
 * the stitches it stands for, so it's a color that's really in the photo rather than a muddy midpoint. The palette is
 * ordered from the most stitches to the fewest.
 */
export function reduceColors(colors: (Rgb | null)[], count: number): Pick<Pattern, "palette" | "cells"> {
  const { buckets, bucketOfStitch } = bucketsOf(colors);
  if (buckets.length === 0) return { palette: [], cells: colors.map(() => null) };
  const { centers, assignment } = cluster(buckets, Math.max(1, count));

  const groups = centers.map(() => ({ sum: [0, 0, 0], weight: 0 }));
  buckets.forEach((bucket, index) => {
    const group = groups[assignment[index]!]!;
    for (let i = 0; i < 3; i++) group.sum[i]! += bucket.sum[i]!;
    group.weight += bucket.weight;
  });
  // Drop colors nothing ended up using, and put the most used first
  const order = groups.map((group, index) => ({ group, index })).filter(({ group }) => group.weight > 0).sort((a, b) => b.group.weight - a.group.weight);
  const newIndex = new Map(order.map(({ index }, position) => [index, position]));
  return {
    palette: order.map(({ group }) => group.sum.map((value) => fromLinear(value / group.weight)) as Rgb),
    cells: bucketOfStitch.map((bucket) => (bucket === null ? null : newIndex.get(assignment[bucket]!)!)),
  };
}

/** How many separate colors a photo's stitches have, before any reduction (near-identical ones counted once) */
export function distinctColors(colors: (Rgb | null)[]) {
  return bucketsOf(colors).buckets.length;
}

/**
 * The fewest colors that keep the pattern close to the photo: the smallest number at which a stitch is, on average,
 * barely different from the photo (a CIELAB distance of `tolerance`; about 2.3 is the smallest difference most
 * people notice side by side, and stitches are seen from further away).
 */
export function suggestColorCount(colors: (Rgb | null)[], tolerance = 5, most = MAX_COLORS) {
  const { buckets } = bucketsOf(colors);
  if (buckets.length === 0) return 1;
  const total = buckets.reduce((sum, bucket) => sum + bucket.weight, 0);
  const closeEnough = (count: number) => {
    const { centers, assignment } = cluster(buckets, count);
    const error = buckets.reduce((sum, bucket, index) => sum + distance(bucket.lab, centers[assignment[index]!]!) * bucket.weight, 0) / total;
    return error <= tolerance;
  };
  // More colors is closer to the photo, so search for the smallest count that's close enough
  let [low, high] = [1, Math.min(most, buckets.length)];
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (closeEnough(middle)) high = middle;
    else low = middle + 1;
  }
  return low;
}

/** The pattern a photo makes at a given size and number of colors */
export function patternFromImage(pixels: Pixels, columns: number, rows: number, colors: number): Pattern {
  return { columns, rows, ...reduceColors(sampleImage(pixels, columns, rows), colors) };
}
