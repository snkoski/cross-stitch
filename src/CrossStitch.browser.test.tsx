/* The whole tool in real Chromium, with the design system's CSS: drawing, a photo, text, and axe on each. */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  describe("saving and opening", () => {
    /** Catches what the tool hands to the browser to download, instead of downloading it */
    function catchDownloads() {
      const files: { name: string; blob: Blob }[] = [];
      const blobs = new Map<string, Blob>();
      const createObjectUrl = URL.createObjectURL.bind(URL);
      vi.spyOn(URL, "createObjectURL").mockImplementation((object) => {
        const url = createObjectUrl(object);
        if (object instanceof Blob) blobs.set(url, object);
        return url;
      });
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        files.push({ name: this.download, blob: blobs.get(this.href)! });
      });
      return files;
    }

    const firstBytes = async (blob: Blob, count: number) => [...new Uint8Array(await blob.slice(0, count).arrayBuffer())];
    const liveRegion = (container: HTMLElement) => container.querySelector(".cross-stitch__live");

    async function stitchOne(user: ReturnType<typeof userEvent.setup>) {
      screen.getByRole("application").focus();
      await user.keyboard("{ArrowRight}{ArrowDown} ");
      expect(screen.getByText("(1 used, 1 stitch)")).toBeInTheDocument();
    }

    afterEach(() => vi.restoreAllMocks());

    it("saves a PDF named after the pattern, and announces it", async () => {
      const user = userEvent.setup();
      const files = catchDownloads();
      const { container } = render(<CrossStitch />);
      await stitchOne(user);
      await user.type(screen.getByRole("textbox", { name: /Pattern name/ }), "Home: sweet");
      await user.click(screen.getByRole("button", { name: "Save as PDF" }));
      expect(files[0]!.name).toBe("Home sweet.pdf");
      expect(files[0]!.blob.type).toBe("application/pdf");
      expect(await files[0]!.blob.text()).toMatch(/^%PDF-1\.4[\s\S]*\(Home: sweet\)/);
      expect(liveRegion(container)).toHaveTextContent("Saved the pattern as a PDF.");
      await expectNoAxeViolations(container);
    });

    it("saves the chart as a PNG, sized to the pattern", async () => {
      const user = userEvent.setup();
      const files = catchDownloads();
      render(<CrossStitch defaultColumns={10} defaultRows={5} />);
      await stitchOne(user);
      await user.click(screen.getByRole("button", { name: "Save as image" }));
      await waitFor(() => expect(files).toHaveLength(1));
      expect(files[0]!.name).toBe("cross-stitch-pattern.png");
      expect(await firstBytes(files[0]!.blob, 4)).toEqual([0x89, 0x50, 0x4e, 0x47]);
      const image = await createImageBitmap(files[0]!.blob);
      expect([image.width, image.height]).toEqual([201, 101]);
    });

    it("opens a saved pattern file with everything back, and Undo returns to what was there", async () => {
      const user = userEvent.setup();
      const files = catchDownloads();
      const { container, unmount } = render(<CrossStitch defaultColumns={12} defaultRows={9} />);
      await stitchOne(user);
      await user.type(screen.getByRole("textbox", { name: /Pattern name/ }), "Sign");
      await user.selectOptions(screen.getByRole("combobox", { name: "Fabric" }), "18");
      await user.click(screen.getByRole("button", { name: "Save pattern file" }));
      expect(files[0]!.name).toBe("Sign.cross-stitch.json");
      unmount();

      render(<CrossStitch />);
      expect(screen.getByRole("application", { name: "Pattern, 40 stitches across and 30 down" })).toBeInTheDocument();
      await user.upload(screen.getByLabelText("Open a pattern file"), new File([files[0]!.blob], files[0]!.name, { type: "application/json" }));
      expect(await screen.findByRole("application", { name: "Pattern, 12 stitches across and 9 down" })).toBeInTheDocument();
      expect(screen.getByText("(1 used, 1 stitch)")).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: /Pattern name/ })).toHaveValue("Sign");
      expect(screen.getByRole("combobox", { name: "Fabric" })).toHaveValue("18");
      expect(container.ownerDocument.querySelector(".cross-stitch__live")).toHaveTextContent("Opened Sign: 12 stitches across and 9 down.");

      await user.click(screen.getByRole("button", { name: "Undo" }));
      expect(screen.getByRole("application", { name: "Pattern, 40 stitches across and 30 down" })).toBeInTheDocument();
    });

    it("stops following a photo when a pattern file is opened", async () => {
      const user = userEvent.setup();
      const files = catchDownloads();
      const { unmount } = render(<CrossStitch defaultColumns={12} defaultRows={9} />);
      await user.click(screen.getByRole("button", { name: "Save pattern file" }));
      unmount();

      render(<CrossStitch />);
      await user.upload(screen.getByLabelText("Choose a photo"), await sunset());
      await screen.findByRole("slider", { name: "Colors" });
      await user.upload(screen.getByLabelText("Open a pattern file"), new File([files[0]!.blob], files[0]!.name));
      await screen.findByRole("application", { name: "Pattern, 12 stitches across and 9 down" });
      expect(screen.queryByRole("slider", { name: "Colors" })).not.toBeInTheDocument();
      expect(screen.getByRole("slider", { name: "Stitches down" })).toBeEnabled();
    });

    it("explains a file it can't open, leaves the pattern alone, and clears the message on the next save", async () => {
      const user = userEvent.setup();
      const files = catchDownloads();
      const { container } = render(<CrossStitch />);
      await stitchOne(user);
      await user.upload(screen.getByLabelText("Open a pattern file"), new File(['{"hello":"there"}'], "other.json", { type: "application/json" }));
      const message = "This isn't a pattern file. Choose a file saved from this tool.";
      // Once on the page and once in the live region, so ask for the one on the page
      expect(await screen.findByText(message, { selector: ".cross-stitch__error" })).toBeVisible();
      expect(liveRegion(container)).toHaveTextContent(message);
      expect(screen.getByText("(1 used, 1 stitch)")).toBeInTheDocument();
      await expectNoAxeViolations(container);

      await user.click(screen.getByRole("button", { name: "Save pattern file" }));
      expect(files).toHaveLength(1);
      expect(screen.queryByText(message, { selector: ".cross-stitch__error" })).not.toBeInTheDocument();
      expect(liveRegion(container)).toHaveTextContent("Saved the pattern file.");
    });

    it("warns that floating text won't be saved until it's added", async () => {
      const user = userEvent.setup();
      render(<CrossStitch defaultColumns={100} defaultRows={40} />);
      await user.type(screen.getByRole("textbox", { name: "Words" }), "Hi");
      expect(await screen.findByText(/isn't part of the pattern yet/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Add the text to the pattern" }));
      await waitFor(() => expect(screen.queryByText(/isn't part of the pattern yet/)).not.toBeInTheDocument());
    });
  });
});
