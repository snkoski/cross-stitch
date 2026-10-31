import { describe, expect, it } from "vitest";
import { FONTS, inkMask, snapHeight, stackLines, trim } from "./text";
import type { Mask } from "./pattern";

/** A mask from rows of "#" and "." */
function mask(...rows: string[]): Mask {
  return { columns: rows[0]?.length ?? 0, rows: rows.length, cells: rows.join("").split("").map((cell) => cell === "#") };
}

/** A mask as rows of "#" and ".", to compare */
const draw = ({ columns, cells }: Mask) => Array.from({ length: cells.length / columns || 0 }, (_, row) => cells.slice(row * columns, (row + 1) * columns).map((on) => (on ? "#" : ".")).join(""));

describe("text as stitches", () => {
  it("fills the stitches the letters cover enough of, cut down to just the letters", () => {
    const coverage = { columns: 4, rows: 3, cells: [0, 0, 0, 0, 0, 0.9, 0.3, 0, 0, 0.5, 0.7, 0] };
    expect(draw(inkMask(coverage, 0.42))).toEqual(["#.", "##"]);
    // A lower threshold makes bolder letters
    expect(draw(inkMask(coverage, 0.2))).toEqual(["##", "##"]);
  });

  it("trims to nothing when nothing is stitched", () => {
    expect(trim(mask("...", "..."))).toEqual({ columns: 0, rows: 0, cells: [] });
    expect(draw(trim(mask("....", ".#..", "..#.", "....")))).toEqual(["#.", ".#"]);
  });

  it("stacks lines lined up on the left, center, or right, with bare rows between", () => {
    const wide = mask("####");
    const narrow = mask("##");
    expect(draw(stackLines([wide, narrow], "left", 1))).toEqual(["####", "....", "##.."]);
    expect(draw(stackLines([wide, narrow], "center", 0))).toEqual(["####", ".##."]);
    expect(draw(stackLines([wide, narrow], "right", 0))).toEqual(["####", "..##"]);
    expect(stackLines([], "left", 2)).toEqual({ columns: 0, rows: 0, cells: [] });
  });

  it("keeps the rows of an empty line, so a blank line adds space", () => {
    const blank = { columns: 0, rows: 2, cells: [] };
    expect(draw(stackLines([mask("##"), blank, mask("##")], "left", 1))).toEqual(["##", "..", "..", "..", "..", "##"]);
  });

  it("draws pixel fonts at whole stitches per pixel, and smooth fonts at any height", () => {
    const pixel = FONTS.find((font) => font.family === "Silkscreen")!;
    const smooth = FONTS.find((font) => !font.pixels)!;
    expect(pixel.pixels?.cap).toBe(5);
    expect([snapHeight(pixel, 12), snapHeight(pixel, 13), snapHeight(pixel, 1)]).toEqual([10, 15, 5]);
    expect(snapHeight(smooth, 13)).toBe(13);
  });
});
