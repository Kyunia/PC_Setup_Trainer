import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SetupTestApp } from "./SetupTestApp";
import "../replay/replay.css";
import "./setupTest.css";

createRoot(document.getElementById("root")!).render(<StrictMode><SetupTestApp /></StrictMode>);

