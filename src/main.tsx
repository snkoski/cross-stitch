import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "design-system/fonts.css";
import "design-system/styles.css";
import { CrossStitch } from "./CrossStitch";
import "./app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main className="app">
      <header className="app__header">
        <h1>Cross stitch pattern maker</h1>
        <p>Draw on the grid, add words in a choice of fonts, or turn a photo into a chart with as few thread colors as you like.</p>
      </header>
      <CrossStitch />
    </main>
  </StrictMode>,
);
