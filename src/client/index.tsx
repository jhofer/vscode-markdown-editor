import { App } from "./app";
import React from "react";
import ReactDOM from "react-dom";

const el = document.getElementById("app");
el?.classList.remove("loading");
ReactDOM.render(<App />, el);
