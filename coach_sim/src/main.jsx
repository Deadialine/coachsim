import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Experiment from "./experiment/Experiment";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).get("view") === "concept" ? (
      <App />
    ) : (
      <Experiment />
    )}
  </React.StrictMode>,
);
