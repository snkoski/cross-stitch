import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, HTMLAttributes, InputHTMLAttributes, KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { Button, Segment, SegmentedControl, Switch, TextArea } from "design-system";
import {
  blankPattern,
  distinctColors,
  fromHex,
  inkFor,
  MAX_COLORS,
  patternFromImage,
  resizePattern,
  rowsFor,
  sampleImage,
  setStitch,
  stamp,
  stitchCounts,
  stitchesBetween,
  suggestColorCount,
  SYMBOLS,
  toCss,
  toHex,
} from "./pattern";
import type { Mask, Pattern, Pixels } from "./pattern";
import { FONTS, heightStep, loadFont, snapHeight, textMask } from "./text";
import type { Align, Thickness } from "./text";
import "./cross-stitch.css";

interface OwnProps {
  /** Stitches across at the start. Default: 40. */
  defaultColumns?: number;
  /** Stitches down at the start. Default: 30. */
  defaultRows?: number;
  /** Applied to the outer element, so it's the place for layout classes. */
  className?: string;
}

export type CrossStitchProps = OwnProps & Omit<HTMLAttributes<HTMLDivElement>, keyof OwnProps>;

/** A loaded photo: its pixels at a working size, and a URL to show it */
interface Photo {
  pixels: Pixels;
  url: string;
  name: string;
}

const [MIN_SIZE, MAX_SIZE] = [5, 200];
/** How many pixels across a photo is read at: plenty for 200 stitches, small enough to stay quick */
const PHOTO_WIDTH = 800;
/** The fabric between stitches */
const FABRIC = "rgb(251 250 246)";
const FABRIC_COUNTS = [11, 14, 16, 18];
const HISTORY = 100;

/** A slider with its label and its value. Only the words name it, so a screen reader doesn't read the number twice. */
function Range({ label, value, shown = String(value), ...props }: { label: string; value: number; shown?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "type">) {
  const id = useId();
  return (
    <div className="cross-stitch__range">
      <label htmlFor={id}>{label}</label>
      <output htmlFor={id}>{shown}</output>
      <input {...props} id={id} type="range" value={value} />
    </div>
  );
}

const colorName = (pattern: Pattern, index: number | null) =>
  index === null ? "bare fabric" : `color ${index + 1} (${toHex(pattern.palette[index]!)}, symbol ${SYMBOLS[index]})`;

/** Reads a photo file into pixels, at most PHOTO_WIDTH across */
async function readPhoto(file: File): Promise<Photo> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  await image.decode();
  const scale = Math.min(1, PHOTO_WIDTH / image.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d")!;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { pixels: context.getImageData(0, 0, canvas.width, canvas.height), url, name: file.name };
}

/**
 * A cross-stitch chart to design on: pick a size and a color, then click, drag, or use the keyboard to stitch. Or
 * load a photo, and it becomes a chart, with a slider for how many thread colors it uses. Each color has a symbol and
 * a stitch count, as printed charts do. Text is typed in, set in a font, and dragged into place before it's added.
 */
export function CrossStitch({ defaultColumns = 40, defaultRows = 30, className, ...rest }: CrossStitchProps) {
  const id = useId();
  const [pattern, setPattern] = useState(() => blankPattern(defaultColumns, defaultRows));
  const [history, setHistory] = useState<Pattern[]>([]);
  const [selected, setSelected] = useState<number | null>(0);
  const [showSymbols, setShowSymbols] = useState(true);
  const [stitchSize, setStitchSize] = useState(16);
  const [fabricCount, setFabricCount] = useState(14);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [colorCount, setColorCount] = useState(8);
  const [cursor, setCursor] = useState<[number, number]>([0, 0]);
  const [focused, setFocused] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<{ last: [number, number] } | null>(null);

  // Text floats over the chart, as a shape, until it's added to the pattern
  const [text, setText] = useState("");
  const [fontFamily, setFontFamily] = useState(FONTS[0]!.family);
  const [letterHeight, setLetterHeight] = useState(10);
  const [align, setAlign] = useState<Align>("center");
  const [lineGap, setLineGap] = useState(2);
  const [spacing, setSpacing] = useState(0);
  const [thickness, setThickness] = useState<Thickness>("regular");
  const [shape, setShape] = useState<Mask | null>(null);
  const [fontFailed, setFontFailed] = useState(false);
  /** Where the text's top center is, once it's been moved; until then it's centered on the chart */
  const [textAt, setTextAt] = useState<[number, number] | null>(null);
  const drag = useRef<{ start: [number, number]; from: [number, number] } | null>(null);
  const font = FONTS.find((each) => each.family === fontFamily)!;

  useEffect(() => {
    if (!text.trim()) {
      setShape(null);
      return;
    }
    let current = true;
    void loadFont(font, text).then((loaded) => {
      if (!current) return;
      setFontFailed(!loaded);
      setShape(textMask(text, { font, height: letterHeight, align, lineGap, spacing, thickness }));
    });
    return () => {
      current = false;
    };
  }, [text, font, letterHeight, align, lineGap, spacing, thickness]);

  const floating = shape && text.trim() ? shape : null;
  const textCenter: [number, number] = textAt ?? [Math.floor(pattern.columns / 2), Math.floor((pattern.rows - (floating?.rows ?? 0)) / 2)];
  const textLeft = textCenter[0] - Math.floor((floating?.columns ?? 0) / 2);
  const textTop = textCenter[1];
  const textFits = floating !== null && textLeft >= 0 && textTop >= 0 && textLeft + floating.columns <= pattern.columns && textTop + floating.rows <= pattern.rows;

  const moveText = (column: number, row: number) => {
    setTextAt([column, row]);
    setAnnouncement(`Text moved to row ${row + 1}, column ${column - Math.floor((floating?.columns ?? 0) / 2) + 1}.`);
  };

  const placeText = () => {
    if (!floating) return;
    commit(stamp(pattern, floating, textLeft, textTop, selected));
    setText("");
    setTextAt(null);
    setAnnouncement(selected === null ? "Cut the text out of the pattern." : `Added the text in color ${selected + 1}.`);
  };

  const removeText = () => {
    setText("");
    setTextAt(null);
  };

  const counts = stitchCounts(pattern);
  const total = counts.reduce((sum, count) => sum + count, 0);

  // What the photo has to offer at this size: its colors, and how many keep it close
  const photoColors = useMemo(() => (photo ? sampleImage(photo.pixels, pattern.columns, pattern.rows) : null), [photo, pattern.columns, pattern.rows]);
  const distinct = useMemo(() => (photoColors ? distinctColors(photoColors) : 0), [photoColors]);
  const suggested = useMemo(() => (photoColors ? suggestColorCount(photoColors) : 0), [photoColors]);
  const mostColors = Math.max(1, Math.min(MAX_COLORS, distinct));

  /** Changes the pattern, keeping the old one for Undo */
  const commit = (next: Pattern) => {
    if (next === pattern) return;
    setHistory((past) => [...past.slice(-HISTORY + 1), pattern]);
    setPattern(next);
  };

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((past) => past.slice(0, -1));
    setPattern(previous);
    if (selected !== null && selected >= previous.palette.length) setSelected(0);
  };

  /** Redraws the pattern from the photo at a size and number of colors */
  const fromPhoto = (source: Photo, columns: number, colors: number) => {
    const rows = Math.min(MAX_SIZE, rowsFor(source.pixels.width, source.pixels.height, columns));
    commit(patternFromImage(source.pixels, columns, rows, colors));
    setSelected(0);
  };

  const changeColumns = (columns: number) => {
    if (photo) fromPhoto(photo, columns, colorCount);
    else commit(resizePattern(pattern, columns, pattern.rows));
  };

  const loadPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const loaded = await readPhoto(file);
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(loaded);
    const rows = Math.min(MAX_SIZE, rowsFor(loaded.pixels.width, loaded.pixels.height, pattern.columns));
    const colors = sampleImage(loaded.pixels, pattern.columns, rows);
    const count = suggestColorCount(colors);
    setColorCount(count);
    fromPhoto(loaded, pattern.columns, count);
    setAnnouncement(`Made a pattern from ${loaded.name} with ${count} colors.`);
  };

  const removePhoto = () => {
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
  };

  const recolor = (hex: string) => {
    if (selected === null) return;
    const palette = pattern.palette.slice();
    palette[selected] = fromHex(hex);
    commit({ ...pattern, palette });
  };

  const addColor = () => {
    if (pattern.palette.length >= MAX_COLORS) return;
    const color = selected === null ? pattern.palette[0] ?? [33, 33, 36] : pattern.palette[selected]!;
    commit({ ...pattern, palette: [...pattern.palette, color] });
    setSelected(pattern.palette.length);
  };

  const removeColor = () => {
    if (selected === null || pattern.palette.length <= 1) return;
    const palette = pattern.palette.filter((_, index) => index !== selected);
    const cells = pattern.cells.map((cell) => (cell === null || cell === selected ? null : cell > selected ? cell - 1 : cell));
    commit({ ...pattern, palette, cells });
    setSelected(Math.max(0, selected - 1));
  };

  // --- Stitching with the mouse, a finger, or a pen ---
  const stitchAt = (event: ReactPointerEvent<HTMLCanvasElement>): [number, number] => {
    const box = event.currentTarget.getBoundingClientRect();
    return [Math.floor((event.clientX - box.left) / stitchSize), Math.floor((event.clientY - box.top) / stitchSize)];
  };

  const startStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const at = stitchAt(event);
    // While text floats, dragging anywhere on the chart moves it
    if (floating) {
      drag.current = { start: at, from: textCenter };
      return;
    }
    stroke.current = { last: at };
    setCursor([Math.min(Math.max(at[0], 0), pattern.columns - 1), Math.min(Math.max(at[1], 0), pattern.rows - 1)]);
    commit(setStitch(pattern, at[0], at[1], selected));
  };

  const continueStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (drag.current) {
      const at = stitchAt(event);
      const { start, from } = drag.current;
      setTextAt([from[0] + at[0] - start[0], from[1] + at[1] - start[1]]);
      return;
    }
    if (!stroke.current) return;
    const at = stitchAt(event);
    const [last] = [stroke.current.last];
    if (at[0] === last[0] && at[1] === last[1]) return;
    // One stroke is one step to undo, so later stitches in it change the pattern without adding to the history
    setPattern((current) => stitchesBetween(last, at).reduce((next, [column, row]) => setStitch(next, column, row, selected), current));
    stroke.current.last = at;
  };

  const endStroke = () => {
    stroke.current = null;
    drag.current = null;
  };

  // --- Stitching with the keyboard ---
  const moveTo = (column: number, row: number) => {
    const next: [number, number] = [Math.min(Math.max(column, 0), pattern.columns - 1), Math.min(Math.max(row, 0), pattern.rows - 1)];
    setCursor(next);
    setAnnouncement(`Row ${next[1] + 1}, column ${next[0] + 1}: ${colorName(pattern, pattern.cells[next[1] * pattern.columns + next[0]] ?? null)}.`);
  };

  const keyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const step = event.shiftKey ? 10 : 1;
    if (floating) {
      // While text floats, the arrow keys move it, Enter adds it, and Escape takes it away
      const [x, y] = textCenter;
      const nudges: Record<string, [number, number]> = { ArrowLeft: [x - step, y], ArrowRight: [x + step, y], ArrowUp: [x, y - step], ArrowDown: [x, y + step] };
      if (nudges[event.key]) {
        event.preventDefault();
        moveText(...nudges[event.key]!);
      } else if (event.key === "Enter") {
        event.preventDefault();
        placeText();
      } else if (event.key === "Escape") {
        event.preventDefault();
        removeText();
        setAnnouncement("Removed the text.");
      }
      return;
    }
    const [column, row] = cursor;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [column - step, row],
      ArrowRight: [column + step, row],
      ArrowUp: [column, row - step],
      ArrowDown: [column, row + step],
      Home: [0, row],
      End: [pattern.columns - 1, row],
    };
    if (moves[event.key]) {
      event.preventDefault();
      moveTo(...moves[event.key]!);
    } else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      // Stitching the same color again takes it out, so Space toggles
      const current = pattern.cells[row * pattern.columns + column];
      const value = current === selected ? null : selected;
      commit(setStitch(pattern, column, row, value));
      setAnnouncement(`Row ${row + 1}, column ${column + 1}: ${colorName(pattern, value)}.`);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      commit(setStitch(pattern, column, row, null));
      setAnnouncement(`Row ${row + 1}, column ${column + 1}: bare fabric.`);
    } else if (event.key === "z" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      undo();
    }
  };

  // --- Drawing the chart ---
  useLayoutEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const { columns, rows, cells, palette } = pattern;
    const [width, height] = [columns * stitchSize + 1, rows * stitchSize + 1];
    const density = window.devicePixelRatio || 1;
    element.width = Math.round(width * density);
    element.height = Math.round(height * density);
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    context.setTransform(density, 0, 0, density, 0, 0);

    context.fillStyle = FABRIC;
    context.fillRect(0, 0, width, height);
    const symbols = showSymbols && stitchSize >= 10;
    context.font = `600 ${Math.round(stitchSize * 0.62)}px system-ui, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const drawStitch = (column: number, row: number, cell: number | null) => {
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
    // Floating text, drawn as it will be stitched
    floating?.cells.forEach((on, index) => {
      const [column, row] = [textLeft + (index % floating.columns), textTop + Math.floor(index / floating.columns)];
      if (on && column >= 0 && row >= 0 && column < columns && row < rows) drawStitch(column, row, selected);
    });

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

    // Floating text has a dashed edge, black over white, so it shows on any color
    if (floating) {
      const [x, y, w, h] = [textLeft * stitchSize, textTop * stitchSize, floating.columns * stitchSize, floating.rows * stitchSize];
      context.lineWidth = 2;
      context.setLineDash([]);
      context.strokeStyle = "white";
      context.strokeRect(x - 2, y - 2, w + 5, h + 5);
      context.setLineDash([6, 4]);
      context.strokeStyle = "black";
      context.strokeRect(x - 2, y - 2, w + 5, h + 5);
      context.setLineDash([]);
    }

    // The keyboard's place: a black square inside a white one, so it shows on any color
    if (focused && !floating) {
      const [x, y] = [cursor[0] * stitchSize, cursor[1] * stitchSize];
      context.lineWidth = 2;
      context.strokeStyle = "white";
      context.strokeRect(x + 1, y + 1, stitchSize - 1, stitchSize - 1);
      context.strokeStyle = "black";
      context.strokeRect(x - 1, y - 1, stitchSize + 3, stitchSize + 3);
    }
  }, [pattern, showSymbols, stitchSize, cursor, focused, floating, textLeft, textTop, selected]);

  const inches = (stitches: number) => stitches / fabricCount;
  const used = counts.filter((count) => count > 0).length;

  return (
    <div {...rest} className={className ? `cross-stitch ${className}` : "cross-stitch"}>
      <div className="cross-stitch__controls">
        <fieldset className="cross-stitch__group">
          <legend className="cross-stitch__legend">Size</legend>
          <Range label="Stitches across" min={MIN_SIZE} max={MAX_SIZE} value={pattern.columns} onChange={(event) => changeColumns(Number(event.target.value))} />
          <Range
            label="Stitches down"
            min={MIN_SIZE}
            max={MAX_SIZE}
            value={pattern.rows}
            disabled={photo !== null}
            aria-describedby={photo ? `${id}-follows` : undefined}
            onChange={(event) => commit(resizePattern(pattern, pattern.columns, Number(event.target.value)))}
          />
          {photo && (
            <p id={`${id}-follows`} className="cross-stitch__note">
              Follows the photo's shape.
            </p>
          )}
          <label className="cross-stitch__select">
            <span>Fabric</span>
            <select value={fabricCount} onChange={(event) => setFabricCount(Number(event.target.value))}>
              {FABRIC_COUNTS.map((count) => (
                <option key={count} value={count}>
                  {count}-count Aida
                </option>
              ))}
            </select>
          </label>
          <p className="cross-stitch__note">
            Finished size: {inches(pattern.columns).toFixed(1)} × {inches(pattern.rows).toFixed(1)} in ({(inches(pattern.columns) * 2.54).toFixed(1)} ×{" "}
            {(inches(pattern.rows) * 2.54).toFixed(1)} cm).
          </p>
        </fieldset>

        <fieldset className="cross-stitch__group">
          <legend className="cross-stitch__legend">From a photo</legend>
          <label className="cross-stitch__file">
            <input type="file" accept="image/*" onChange={loadPhoto} />
            <span className="button" data-variant="secondary" data-size="md" data-shape="rectangle">
              {photo ? "Choose another photo" : "Choose a photo"}
            </span>
          </label>
          {photo && (
            <>
              <img className="cross-stitch__photo" src={photo.url} alt={`The photo: ${photo.name}`} />
              <Range
                label="Colors"
                min={1}
                max={mostColors}
                value={Math.min(colorCount, mostColors)}
                aria-describedby={`${id}-colors`}
                onChange={(event) => {
                  setColorCount(Number(event.target.value));
                  fromPhoto(photo, pattern.columns, Number(event.target.value));
                }}
              />
              <p id={`${id}-colors`} className="cross-stitch__note">
                At this size the photo has {distinct === 1 ? "1 color" : `about ${distinct} colors`}. {suggested} {suggested === 1 ? "keeps" : "keep"} it close; fewer
                make it flatter and quicker to stitch. Changing the size or colors redraws the pattern from the photo.
              </p>
              <div className="cross-stitch__buttons">
                {colorCount !== suggested && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setColorCount(suggested);
                      fromPhoto(photo, pattern.columns, suggested);
                    }}
                  >
                    Use {suggested} colors
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={removePhoto}>
                  Stop following the photo
                </Button>
              </div>
            </>
          )}
        </fieldset>

        <fieldset className="cross-stitch__group">
          <legend className="cross-stitch__legend">Text</legend>
          <TextArea label="Words" description="Each line here is a line of stitches." rows={3} value={text} onValueChange={setText} />
          <label className="cross-stitch__select">
            <span>Font</span>
            <select
              value={fontFamily}
              aria-describedby={`${id}-font`}
              onChange={(event) => {
                const next = FONTS.find((each) => each.family === event.target.value)!;
                setFontFamily(next.family);
                setLetterHeight((height) => snapHeight(next, height));
              }}
            >
              {(["Stitch alphabets", "Smooth"] as const).map((group) => (
                <optgroup key={group} label={group}>
                  {FONTS.filter((each) => each.group === group).map((each) => (
                    <option key={each.family} value={each.family}>
                      {each.family}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <p id={`${id}-font`} className="cross-stitch__note">
            {fontFailed
              ? "This font couldn't be loaded, so the text is drawn in a fallback font. Check the internet connection."
              : font.pixels
                ? `A stitch alphabet: every letter lands exactly on the grid, so it's crisp at any size. Heights go up in steps of ${font.pixels.cap}.`
                : "Smooth fonts look best at 12 stitches tall or more; smaller, their curves get rough."}
          </p>
          <Range
            label="Letter height"
            min={heightStep(font)}
            max={heightStep(font) * Math.floor(60 / heightStep(font))}
            step={heightStep(font)}
            value={letterHeight}
            shown={`${letterHeight} stitches`}
            onChange={(event) => setLetterHeight(Number(event.target.value))}
          />
          <SegmentedControl label="Line up" value={align} onValueChange={(value) => setAlign(value as Align)}>
            <Segment value="left">Left</Segment>
            <Segment value="center">Center</Segment>
            <Segment value="right">Right</Segment>
          </SegmentedControl>
          <Range label="Space between lines" min={0} max={20} value={lineGap} shown={`${lineGap} rows`} onChange={(event) => setLineGap(Number(event.target.value))} />
          <Range label="Space between letters" min={0} max={6} value={spacing} shown={`${spacing} added`} onChange={(event) => setSpacing(Number(event.target.value))} />
          {!font.pixels && (
            <SegmentedControl label="Thickness" value={thickness} onValueChange={(value) => setThickness(value as Thickness)}>
              <Segment value="thin">Thin</Segment>
              <Segment value="regular">Regular</Segment>
              <Segment value="thick">Thick</Segment>
            </SegmentedControl>
          )}
          {floating && (
            <>
              <p className="cross-stitch__note">
                {floating.columns} × {floating.rows} stitches, in {selected === null ? "bare fabric: the eraser cuts the letters out of what's under them" : `color ${selected + 1}`}. Drag it on the
                chart, or use the arrow keys there, to move it.{" "}
                {!textFits &&
                  (floating.columns > pattern.columns || floating.rows > pattern.rows
                    ? `It's bigger than the chart (${pattern.columns} × ${pattern.rows}), so make the letters smaller or the chart bigger.`
                    : "Part of it is off the chart, and would be cut off.")}
              </p>
              <div className="cross-stitch__buttons">
                <Button size="sm" onClick={placeText}>
                  Add the text to the pattern
                </Button>
                {textAt && (
                  <Button variant="secondary" size="sm" onClick={() => setTextAt(null)}>
                    Center it
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={removeText}>
                  Remove the text
                </Button>
              </div>
            </>
          )}
        </fieldset>

        <fieldset className="cross-stitch__group">
          <legend className="cross-stitch__legend">
            Colors<span className="cross-stitch__meta">({used} used, {total} {total === 1 ? "stitch" : "stitches"})</span>
          </legend>
          <div className="cross-stitch__palette">
            <label className="cross-stitch__swatch">
              <input type="radio" name={`${id}-color`} checked={selected === null} onChange={() => setSelected(null)} />
              <span className="cross-stitch__chip" data-eraser="" aria-hidden="true" />
              <span>Eraser</span>
            </label>
            {pattern.palette.map((color, index) => (
              <label key={index} className="cross-stitch__swatch">
                <input type="radio" name={`${id}-color`} checked={selected === index} onChange={() => setSelected(index)} aria-label={`Color ${index + 1}, ${toHex(color)}, ${counts[index]} stitches`} />
                <span className="cross-stitch__chip" style={{ background: toCss(color), color: inkFor(color) }} aria-hidden="true">
                  {SYMBOLS[index]}
                </span>
                <span aria-hidden="true">{counts[index]}</span>
              </label>
            ))}
          </div>
          <div className="cross-stitch__buttons">
            {selected !== null && (
              <label className="cross-stitch__picker">
                <input type="color" value={toHex(pattern.palette[selected]!)} onChange={(event) => recolor(event.target.value)} />
                <span>Change color {selected + 1}</span>
              </label>
            )}
            <Button variant="secondary" size="sm" onClick={addColor} disabled={pattern.palette.length >= MAX_COLORS}>
              Add a color
            </Button>
            {selected !== null && pattern.palette.length > 1 && (
              <Button variant="ghost" size="sm" onClick={removeColor}>
                Remove color {selected + 1}
              </Button>
            )}
          </div>
        </fieldset>

        <fieldset className="cross-stitch__group">
          <legend className="cross-stitch__legend">Chart</legend>
          <Range label="Zoom" min={6} max={32} value={stitchSize} shown={`${stitchSize}px`} onChange={(event) => setStitchSize(Number(event.target.value))} />
          <Switch checked={showSymbols} onCheckedChange={setShowSymbols} description="Shown from a zoom of 10px.">
            Show symbols
          </Switch>
          <div className="cross-stitch__buttons">
            <Button variant="secondary" size="sm" onClick={undo} disabled={history.length === 0}>
              Undo
            </Button>
            <Button variant="ghost" size="sm" onClick={() => commit({ ...pattern, cells: pattern.cells.map(() => null) })} disabled={total === 0}>
              Clear stitches
            </Button>
          </div>
        </fieldset>
      </div>

      <div className="cross-stitch__chart">
        <canvas
          ref={canvas}
          className="cross-stitch__canvas"
          tabIndex={0}
          role="application"
          aria-roledescription="stitch chart"
          aria-label={`Pattern, ${pattern.columns} stitches across and ${pattern.rows} down`}
          aria-describedby={`${id}-help`}
          data-floating={floating ? "" : undefined}
          onPointerDown={startStroke}
          onPointerMove={continueStroke}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onKeyDown={keyDown}
          onFocus={() => {
            setFocused(true);
            moveTo(...cursor);
          }}
          onBlur={() => setFocused(false)}
        />
        <p id={`${id}-help`} className="cross-stitch__note">
          {floating
            ? "The text floats over the chart until it's added. Drag it to move it. With the keyboard: arrow keys move it (with Shift, by 10), Enter adds it, and Escape removes it."
            : "Click or drag to stitch in the chosen color. With the keyboard: arrow keys move (with Shift, by 10), Space stitches or unstitches, Delete unstitches, and Ctrl+Z undoes."}
        </p>
      </div>
      <p className="cross-stitch__live" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
