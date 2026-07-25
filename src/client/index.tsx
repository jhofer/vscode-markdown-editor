import { App } from "./app";
import React from "react";
import { createRoot } from "react-dom/client";

const el = document.getElementById("app");
el?.classList.remove("loading");
if (el) {
  createRoot(el).render(<App />);
}
