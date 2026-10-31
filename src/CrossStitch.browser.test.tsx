/* The whole tool in real Chromium, with the design system's CSS: drawing, a photo, text, and axe on each. */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import "design-system/styles.css";
import { CrossStitch } from "./CrossStitch";

afterEach(cleanup);

async function expectNoAxeViolations(container: HTMLElement) {
  const { violations } = await axe.run(container);
  expect(violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(", ")}`)).toEqual([]);
}

/** A sunset, drawn on a canvas and handed to the file input as a PNG, the way a chosen photo would be */
async function sunset() {
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = [320, 200];
  const context = canvas.getContext("2d")!;
  const sky = context.createLinearGradient(0, 0, 0, 140);
  sky.addColorStop(0, "#2b2d6e");
  sky.addColorStop(0.5, "#d9486a");
  sky.addColorStop(1, "#f7b267");
  context.fillStyle = sky;
  context.fillRect(0, 0, 320, 140);
  context.fillStyle = "#ffe08a";
  context.beginPath();
  context.arc(160, 140, 40, Math.PI, 0);
  context.fill();
  context.fillStyle = "#1d3b53";
  context.fillRect(0, 140, 320, 60);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
  return new File([blob], "sunset.png", { type: "image/png" });
}

/** Simulated keys don't move a range input, so set it as a drag would */
function slide(slider: HTMLElement, value: number) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(slider, String(value));
  slider.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("CrossStitch", () => {
  it("stitches with the keyboard, and undoes it", async () => {
    const user = userEvent.setup();
    const { container } = render(<CrossStitch />);
    const chart = screen.getByRole("application", { name: "Pattern, 40 stitches across and 30 down" });
    expect(screen.getByText("(0 used, 0 stitches)")).toBeInTheDocument();
    chart.focus();
    await user.keyboard("{ArrowRight}{ArrowDown} ");
    expect(screen.getByText("(1 used, 1 stitch)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("(0 used, 0 stitches)")).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("turns a photo into a pattern, and reduces its colors", async () => {
    const user = userEvent.setup();
    const { container } = render(<CrossStitch />);
    await user.upload(screen.getByLabelText("Choose a photo"), await sunset());
    const colors = await screen.findByRole("slider", { name: "Colors" });
    // The chart follows the photo's shape: 320 × 200 at 40 across is 25 down
    expect(screen.getByRole("application", { name: "Pattern, 40 stitches across and 25 down" })).toBeInTheDocument();
    const suggested = Number((colors as HTMLInputElement).value);
    expect(suggested).toBeGreaterThan(2);
    // Every stitch is stitched: a photo has no bare fabric
    expect(screen.getByText(`(${suggested} used, 1000 stitches)`)).toBeInTheDocument();
    slide(colors, 3);
    await waitFor(() => expect(screen.getByText("(3 used, 1000 stitches)")).toBeInTheDocument());
    await expectNoAxeViolations(container);
  });

  it("sets words in a font, places them with the keyboard, and adds them in one step to undo", async () => {
    const user = userEvent.setup();
    const { container } = render(<CrossStitch defaultColumns={100} defaultRows={40} />);
    await user.type(screen.getByRole("textbox", { name: "Words" }), "Home{Enter}sweet home");
    // Silkscreen 10 stitches tall: "sweet home" is wider than the chart. Tiny5's narrower letters fit.
    expect(await screen.findByText(/^\d+ × 22 stitches, in color 1\. .*bigger than the chart/)).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Font" }), "Tiny5");
    await waitFor(() => expect(screen.getByText(/^\d+ × \d+ stitches, in color 1\./)).not.toHaveTextContent(/bigger than the chart|off the chart/));
    await expectNoAxeViolations(container);
    screen.getByRole("application").focus();
    await user.keyboard("{ArrowUp}{Enter}");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Add the text to the pattern" })).not.toBeInTheDocument());
    expect(screen.getByText(/\(1 used, [1-9]\d* stitches\)/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("(0 used, 0 stitches)")).toBeInTheDocument();
  });
});
