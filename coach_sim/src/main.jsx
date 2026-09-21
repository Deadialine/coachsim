import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import Experiment from "./experiment/Experiment";
import "./index.css";
const App = lazy(() => import("./App"));

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {["hand", "concept"].includes(
      new URLSearchParams(window.location.search).get("view"),
    ) ? (
      <Suspense
        fallback={<p style={{ padding: 32 }}>Loading hand mechanics…</p>}
      >
        <App />
      </Suspense>
    ) : (
      <Experiment />
    )}
  </React.StrictMode>,
);
