import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const root = document.getElementById("root")!;

if (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) {
  let savedScroll = 0;
  let lockUntil = 0;

  root.addEventListener("scroll", () => {
    if (Date.now() < lockUntil) {
      root.scrollTop = savedScroll;
      return;
    }
    savedScroll = root.scrollTop;
  });

  document.addEventListener("focusin", (e) => {
    const el = e.target as HTMLElement;
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
      savedScroll = root.scrollTop;
      lockUntil = Date.now() + 300;
      setTimeout(() => {
        root.scrollTop = savedScroll;
      }, 50);
      setTimeout(() => {
        root.scrollTop = savedScroll;
      }, 150);
      setTimeout(() => {
        root.scrollTop = savedScroll;
      }, 300);
    }
  });
}

createRoot(root).render(<App />);
