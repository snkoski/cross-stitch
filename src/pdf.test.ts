import { describe, expect, it } from "vitest";
import { blankPattern, setStitch, SYMBOLS } from "./pattern";
import type { Pattern, Rgb } from "./pattern";
import { chartPages, patternToPdf } from "./pdf";

const asText = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);
const pdfOf = (pattern: Pattern, name = "Test") => asText(patternToPdf(pattern, { name, fabricCount: 14 }));
const pageCount = (pdf: string) => pdf.match(/\/Type \/Page /g)?.length ?? 0;

/** Every stitch filled, cycling through every color */
function fullPattern(columns: number, rows: number, colors = SYMBOLS.length): Pattern {
  const palette = Array.from({ length: colors }, (_, index): Rgb => [(index * 6) % 256, 255 - (index * 6) % 256, (index * 37) % 256]);
  return { columns, rows, palette, cells: Array.from({ length: columns * rows }, (_, index) => index % colors) };
}

describe("chartPages", () => {
  it("keeps a chart that fits on one page", () => {
    expect(chartPages(40, 30)).toEqual([{ column: 0, row: 0, columns: 40, rows: 30 }]);
    expect(chartPages(62, 82)).toEqual([{ column: 0, row: 0, columns: 62, rows: 82 }]);
  });

  it("repeats two stitches at each break, and starts each page on a bold line", () => {
    expect(chartPages(63, 10)).toEqual([
      { column: 0, row: 0, columns: 62, rows: 10 },
      { column: 60, row: 0, columns: 3, rows: 10 },
    ]);
    expect(chartPages(10, 83).map(({ row, rows }) => [row, rows])).toEqual([[0, 82], [80, 3]]);
  });

  it("reads across and then down", () => {
    expect(chartPages(100, 100).map(({ column, row }) => [column, row])).toEqual([[0, 0], [60, 0], [0, 80], [60, 80]]);
  });

  it("covers every stitch of the largest chart", () => {
    const seen = new Set<number>();
    for (const { column, row, columns, rows } of chartPages(200, 200)) {
      for (let y = row; y < row + rows; y++) for (let x = column; x < column + columns; x++) seen.add(y * 200 + x);
    }
    expect(seen.size).toBe(200 * 200);
  });
});

describe("patternToPdf", () => {
  it("writes a file whose index points at every object", () => {
    const pdf = pdfOf(fullPattern(70, 90));
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf.endsWith("%%EOF\n")).toBe(true);
    const xref = Number(pdf.match(/startxref\n(\d+)/)![1]);
    expect(pdf.slice(xref, xref + 4)).toBe("xref");
    const entries = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
    expect(entries.length).toBeGreaterThan(40);
    entries.forEach((offset, index) => expect(pdf.slice(offset).startsWith(`${index + 1} 0 obj\n`)).toBe(true));
    expect(pdf).toContain(`/Size ${entries.length + 1} `);
  });

  it("gives each stream its true length", () => {
    const pdf = pdfOf(fullPattern(20, 20));
    for (const match of pdf.matchAll(/\/Length (\d+) >>\nstream\n/g)) {
      const start = match.index + match[0].length;
      expect(pdf.slice(start + Number(match[1]), start + Number(match[1]) + 10)).toBe("\nendstream");
    }
  });

  it("is plain ASCII, so byte offsets can be counted", () => {
    const bytes = patternToPdf(fullPattern(20, 20), { name: "Café ★ 家 (home)", fabricCount: 14 });
    expect(bytes.every((byte) => byte < 128)).toBe(true);
  });

  it("has a cover and the chart pages, with each page labeled", () => {
    const pdf = pdfOf(fullPattern(100, 100));
    expect(pageCount(pdf)).toBe(5);
    expect(pdf).toContain("/Count 5 ");
    expect(pdf).toContain("(Chart 1 of 4: columns 1 to 62, rows 1 to 82)");
    expect(pdf).toContain("(Chart 4 of 4: columns 61 to 100, rows 81 to 100)");
    expect(pdf).toContain("(Page 5 of 5)");
    expect(pdf).toContain("(Gray bars mark stitches repeated on the next page.)");
  });

  it("leaves out the note about repeated stitches when nothing repeats", () => {
    expect(pdfOf(fullPattern(40, 30))).not.toContain("Gray bars");
  });

  it("states the size, the finished size, and the totals", () => {
    const pdf = asText(patternToPdf(fullPattern(28, 14, 2), { name: "Test", fabricCount: 14 }));
    expect(pdf).toContain("(28 \\327 14 stitches. 392 stitches in 2 colors.)");
    expect(pdf).toContain("(Finished size on 14-count Aida: 2.0 \\327 1.0 in \\(5.1 \\327 2.5 cm\\).)");
  });

  it("lists only the colors in use, keeping their numbers", () => {
    const pattern = setStitch(blankPattern(10, 10, [[0, 0, 0], [255, 0, 0], [0, 0, 255]]), 1, 1, 2);
    const pdf = pdfOf(pattern);
    expect(pdf).toContain("(Color 3)");
    expect(pdf).toContain("(#0000ff)");
    expect(pdf).toContain("(1 stitch)");
    expect(pdf).not.toContain("(Color 1)");
    expect(pdf).toContain("(10 \\327 10 stitches. 1 stitch in 1 color.)");
  });

  it("says so when there's nothing stitched", () => {
    expect(pdfOf(blankPattern(10, 10))).toContain("(No stitches yet.)");
  });

  it("escapes a name, and can't be broken by one", () => {
    const pdf = pdfOf(blankPattern(10, 10), "A (small) \\ sign");
    expect(pdf).toContain("(A \\(small\\) \\\\ sign)");
  });

  it("puts characters the built-in fonts lack as question marks on the page, and in full in the properties", () => {
    const pdf = pdfOf(blankPattern(10, 10), "家 Café");
    expect(pdf).toContain("(? Caf\\351)");
    expect(pdf).toContain("/Title <FEFF5bb6002000430061006600e9>");
  });

  it("falls back to a title when there's no name", () => {
    expect(pdfOf(blankPattern(10, 10), "  ")).toContain("(Cross stitch pattern)");
  });

  it("has a drawing for every symbol", () => {
    const pdf = pdfOf(fullPattern(40, 40));
    for (let index = 0; index < SYMBOLS.length; index++) expect(pdf).toContain(`/Symbol${index} Do`);
    expect(pdf).not.toMatch(/undefined|NaN/);
  });

  it("stays a reasonable size at the largest chart with the most colors", () => {
    const bytes = patternToPdf(fullPattern(200, 200), { name: "Big", fabricCount: 14 });
    expect(pageCount(asText(bytes))).toBe(13);
    expect(bytes.length).toBeLessThan(6_000_000);
  });
});
