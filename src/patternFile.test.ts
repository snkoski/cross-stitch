import { describe, expect, it } from "vitest";
import { blankPattern, setStitch } from "./pattern";
import { fileBaseName, parsePattern, PatternFileError, serializePattern } from "./patternFile";

const pattern = setStitch(setStitch(blankPattern(6, 5, [[1, 2, 3], [250, 128, 0]]), 0, 0, 1), 5, 4, 0);
const saved = { pattern, name: "Home sweet home", fabricCount: 16 };
/** A good file with some fields changed */
const withFields = (fields: Record<string, unknown>) => JSON.stringify({ ...JSON.parse(serializePattern(saved)), ...fields });

describe("pattern files", () => {
  it("gets back exactly what was saved", () => {
    expect(parsePattern(serializePattern(saved))).toEqual(saved);
  });

  it.each([
    ["text that isn't JSON", "not json"],
    ["JSON that isn't an object", "null"],
    ["a list", "[]"],
    ["some other JSON file", '{"name":"package"}'],
  ])("says it isn't a pattern file: %s", (_, text) => {
    expect(() => parsePattern(text)).toThrow(/isn't a pattern file/);
  });

  it("says when a file is from a newer version", () => {
    expect(() => parsePattern(withFields({ version: 2 }))).toThrow(/newer version/);
  });

  it.each<[string, Record<string, unknown>]>([
    ["too few columns", { columns: 4 }],
    ["too many rows", { rows: 201 }],
    ["a fractional size", { columns: 6.5 }],
    ["no colors", { palette: [] }],
    ["too many colors", { palette: Array(41).fill("#000000") }],
    ["a color that isn't hex", { palette: ["red", "#000000"] }],
    ["too few stitches", { cells: [null] }],
    ["cells that aren't a list", { cells: "oops" }],
    ["a stitch past the palette", { cells: [2, ...Array(29).fill(null)] }],
    ["a negative stitch", { cells: [-1, ...Array(29).fill(null)] }],
    ["a fractional stitch", { cells: [0.5, ...Array(29).fill(null)] }],
    ["a stitch that isn't a number", { cells: ["0", ...Array(29).fill(null)] }],
  ])("rejects a damaged file: %s", (_, fields) => {
    expect(() => parsePattern(withFields(fields))).toThrow(PatternFileError);
    expect(() => parsePattern(withFields(fields))).toThrow(/damaged/);
  });

  it("uses defaults for a missing name or an unknown fabric", () => {
    const { name, fabricCount } = parsePattern(withFields({ name: 7, fabricCount: 99 }));
    expect([name, fabricCount]).toEqual(["", 14]);
  });
});

describe("fileBaseName", () => {
  it("keeps a plain name, spaces and accents included", () => {
    expect(fileBaseName("Café sign 2")).toBe("Café sign 2");
  });

  it("takes out what a file name can't have", () => {
    expect(fileBaseName('../a/b:c*d?"e<f>g|h\\i')).toBe("abcdefghi");
  });

  it("falls back when nothing is left", () => {
    expect(fileBaseName("")).toBe("cross-stitch-pattern");
    expect(fileBaseName(" ... ")).toBe("cross-stitch-pattern");
  });
});
