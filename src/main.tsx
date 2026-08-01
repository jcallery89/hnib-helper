import { render } from "preact";
import { App } from "./app.tsx";
import "./styles/fonts.css"; // self-hosted Teko + Barlow so PNG exports embed them
import "./styles/base.css";

const root = document.getElementById("app");
if (root) render(<App />, root);
