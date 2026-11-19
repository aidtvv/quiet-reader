import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource/lora/400.css";
import "@fontsource/lora/500.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "./styles.css";
import "./real-ui.css";
import "./bookshelf.css";
import "./floating.css";
import "./settings.css";
import "./vocabulary.css";
import "./theme.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
