/* The pattern file: a pattern saved as JSON, to open again and keep editing. No DOM, so it's unit tested. */
import { FABRIC_COUNTS, fromHex, MAX_COLORS, MAX_SIZE, MIN_SIZE, toHex } from "./pattern";
import type { Pattern } from "./pattern";

const FORMAT = "cross-stitch-pattern";
const VERSION = 1;
/** Far bigger than the largest real pattern file, so reading a wrong file doesn't hang the page */
export const MAX_FILE_BYTES = 2_000_000;
export const PATTERN_FILE_EXTENSION = ".cross-stitch.json";

export interface SavedPattern {
  pattern: Pattern;
  name: string;
  fabricCount: number;
}

/** Why a file couldn't be opened, in words to show the person who chose it */
export class PatternFileError extends Error {}

export function serializePattern({ pattern, name, fabricCount }: SavedPattern): string {
  return JSON.stringify({
    format: FORMAT,
    version: VERSION,
    name,
    fabricCount,
    columns: pattern.columns,
    rows: pattern.rows,
    palette: pattern.palette.map(toHex),
    cells: pattern.cells,
  });
}

const isSize = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= MIN_SIZE && (value as number) <= MAX_SIZE;

/** Reads a pattern file, checking everything: it may be some other file, or one that was edited by hand */
export function parsePattern(text: string): SavedPattern {
  const notOurs = new PatternFileError("This isn't a pattern file. Choose a file saved from this tool.");
  const damaged = new PatternFileError("This pattern file is damaged, so it can't be opened.");
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw notOurs;
  }
  if (typeof data !== "object" || data === null || data.format !== FORMAT) throw notOurs;
  if (typeof data.version !== "number" || data.version > VERSION) throw new PatternFileError("This pattern file was saved by a newer version of this tool. Reload the page and try again.");

  const { columns, rows, palette, cells, name, fabricCount } = data;
  if (!isSize(columns) || !isSize(rows)) throw damaged;
  if (!Array.isArray(palette) || palette.length < 1 || palette.length > MAX_COLORS) throw damaged;
  if (!palette.every((color) => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color))) throw damaged;
  if (!Array.isArray(cells) || cells.length !== columns * rows) throw damaged;
  if (!cells.every((cell) => cell === null || (Number.isInteger(cell) && cell >= 0 && cell < palette.length))) throw damaged;

  return {
    pattern: { columns, rows, cells, palette: palette.map(fromHex) },
    name: typeof name === "string" ? name : "",
    fabricCount: FABRIC_COUNTS.includes(fabricCount as number) ? (fabricCount as number) : 14,
  };
}

/** A pattern's name, safe to use as a file name */
export function fileBaseName(name: string) {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f<>:"/\\|?*]/g, "").replace(/^[.\s]+|[.\s]+$/g, "") || "cross-stitch-pattern";
}
