import { describe, expect, it } from "vitest";
import {
  blankPattern,
  distinctColors,
  fromHex,
  inkFor,
  patternFromImage,
  reduceColors,
  resizePattern,
  rowsFor,
  sampleImage,
  setStitch,
  stamp,
  stitchCounts,
  stitchesBetween,
  suggestColorCount,
  toHex,
} from "./pattern";
import type { Pixels, Rgb } from "./pattern";

/** An image from a function of each pixel's position */
function image(width: number, height: number, color: (x: number, y: number) => [number, number, number, number]): Pixels {
  const data: number[] = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.push(...color(x, y));
  return { width, height, data };
}

describe("editing a pattern", () => {
  it("starts blank, at the size asked for", () => {
    const pattern = blankPattern(4, 3);
    expect(pattern.cells).toHaveLength(12);
    expect(pattern.cells.every((cell) => cell === null)).toBe(true);
    expect(pattern.palette.length).toBeGreaterThan(1);
  });

  it("sets one stitch and leaves the original pattern alone", () => {
    const pattern = blankPattern(4, 3);
    const stitched = setStitch(pattern, 2, 1, 0);
    expect(stitched.cells[1 * 4 + 2]).toBe(0);
    expect(pattern.cells[1 * 4 + 2]).toBeNull();
    expect(setStitch(stitched, 2, 1, 0)).toBe(stitched);
    expect(setStitch(stitched, 9, 9, 0)).toBe(stitched);
  });

  it("keeps the top-left stitches when resized", () => {
    const pattern = setStitch(setStitch(blankPattern(3, 3), 0, 0, 1), 2, 2, 2);
    const smaller = resizePattern(pattern, 2, 2);
    expect(smaller.cells).toEqual([1, null, null, null]);
    const larger = resizePattern(pattern, 4, 4);
    expect(larger.cells[0]).toBe(1);
    expect(larger.cells[2 * 4 + 2]).toBe(2);
    expect(larger.cells).toHaveLength(16);
  });

  it("stitches a shape in one color, cut off at the edge, or cuts it out with null", () => {
    const pattern = blankPattern(3, 2);
    const shape = { columns: 2, rows: 2, cells: [true, false, true, true] };
    const stamped = stamp(pattern, shape, 2, 0, 1);
    // Only the left column of the shape fits
    expect(stamped.cells).toEqual([null, null, 1, null, null, 1]);
    expect(pattern.cells.every((cell) => cell === null)).toBe(true);
    expect(stamp(stamped, shape, 1, 0, null).cells).toEqual([null, null, 1, null, null, null]);
    expect(stamp(pattern, shape, 0, 0, null)).toBe(pattern);
  });

  it("counts the stitches of each color", () => {
    let pattern = blankPattern(3, 1, [[0, 0, 0], [255, 255, 255]]);
    pattern = setStitch(setStitch(setStitch(pattern, 0, 0, 1), 1, 0, 1), 2, 0, 0);
    expect(stitchCounts(pattern)).toEqual([1, 2]);
  });

  it("fills in every stitch along a drag, however fast", () => {
    expect(stitchesBetween([0, 0], [3, 0])).toEqual([[0, 0], [1, 0], [2, 0], [3, 0]]);
    expect(stitchesBetween([0, 0], [2, 2])).toEqual([[0, 0], [1, 1], [2, 2]]);
    expect(stitchesBetween([1, 1], [1, 1])).toEqual([[1, 1]]);
    expect(stitchesBetween([3, 0], [0, 1])).toHaveLength(4);
  });
});

describe("colors", () => {
  it("converts to and from hex codes", () => {
    expect(toHex([196, 30, 58])).toBe("#c41e3a");
    expect(fromHex("#c41e3a")).toEqual([196, 30, 58]);
  });

  it("picks symbol ink that reads on the stitch", () => {
    expect(inkFor([20, 20, 20])).toBe("white");
    expect(inkFor([250, 240, 200])).toBe("black");
  });

  it("keeps a photo's proportions", () => {
    expect(rowsFor(400, 300, 40)).toBe(30);
    expect(rowsFor(300, 400, 30)).toBe(40);
    expect(rowsFor(1000, 1, 10)).toBe(1);
  });
});

describe("from a photo to stitches", () => {
  it("averages the pixels under each stitch", () => {
    // Left half black, right half white, 4 pixels wide: two stitches across
    const pixels = image(4, 2, (x) => (x < 2 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    expect(sampleImage(pixels, 2, 1)).toEqual([
      [0, 0, 0],
      [255, 255, 255],
    ]);
  });

  it("averages in linear light, so black and white mix to a mid gray, not a dark one", () => {
    const pixels = image(2, 1, (x) => (x === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    const [gray] = sampleImage(pixels, 1, 1) as Rgb[];
    expect(gray![0]).toBe(188);
  });

  it("leaves mostly transparent stitches as bare fabric", () => {
    const pixels = image(2, 1, (x) => (x === 0 ? [255, 0, 0, 0] : [255, 0, 0, 255]));
    expect(sampleImage(pixels, 2, 1)).toEqual([null, [255, 0, 0]]);
  });

  it("reduces to the number of colors asked for, most used first", () => {
    const colors: (Rgb | null)[] = [
      [250, 10, 10],
      [245, 15, 12],
      [240, 20, 8],
      [10, 10, 250],
      [12, 14, 240],
      [10, 240, 10],
      null,
    ];
    const reduced = reduceColors(colors, 2);
    expect(reduced.palette).toHaveLength(2);
    // The reds are the biggest group, so they're color 0
    expect(reduced.cells.slice(0, 3)).toEqual([0, 0, 0]);
    expect(reduced.palette[0]![0]).toBeGreaterThan(200);
    expect(reduced.cells[6]).toBeNull();
    // With enough colors, each group keeps its own
    expect(reduceColors(colors, 3).palette).toHaveLength(3);
  });

  it("never invents more colors than the photo has", () => {
    const reduced = reduceColors([[0, 0, 0], [0, 0, 0], [255, 255, 255]], 10);
    expect(reduced.palette).toEqual([
      [0, 0, 0],
      [255, 255, 255],
    ]);
    expect(reduceColors([null, null], 5)).toEqual({ palette: [], cells: [null, null] });
  });

  it("gives the same result every time", () => {
    const pixels = image(30, 20, (x, y) => [x * 8, y * 12, (x * y) % 255, 255]);
    expect(patternFromImage(pixels, 15, 10, 6)).toEqual(patternFromImage(pixels, 15, 10, 6));
  });

  it("counts a photo's distinct colors, and suggests how many keep it close", () => {
    // Three flat bands: three colors are all it needs
    const bands = image(30, 3, (x) => (x < 10 ? [200, 30, 30, 255] : x < 20 ? [30, 160, 60, 255] : [40, 60, 200, 255]));
    const colors = sampleImage(bands, 30, 3);
    expect(distinctColors(colors)).toBe(3);
    expect(suggestColorCount(colors)).toBe(3);

    // A smooth gradient has many colors, and needs more than a handful to look smooth
    const gradient = image(60, 1, (x) => [x * 4, 100, 255 - x * 4, 255]);
    const ramp = sampleImage(gradient, 60, 1);
    expect(distinctColors(ramp)).toBeGreaterThan(30);
    expect(suggestColorCount(ramp)).toBeGreaterThan(3);
    expect(suggestColorCount(ramp)).toBeLessThan(distinctColors(ramp));
  });
});
