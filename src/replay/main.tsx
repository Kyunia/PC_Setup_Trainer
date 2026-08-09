import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ReplayApp } from "./ReplayApp";
import "./replay.css";

createRoot(document.getElementById("root")!).render(<StrictMode><ReplayApp /></StrictMode>);
