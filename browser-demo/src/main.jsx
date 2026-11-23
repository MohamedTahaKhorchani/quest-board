import DemoBar from "./browser/DemoBar.jsx";
import "./browser/browser.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <DemoBar/><App />
  </StrictMode>
);
