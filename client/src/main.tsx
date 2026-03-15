import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
  document.addEventListener("focusin", (e) => {
    const el = e.target as HTMLElement;
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
      const scrollY = window.scrollY;
      requestAnimationFrame(() => {
        if (window.scrollY !== scrollY) {
          window.scrollTo(0, scrollY);
        }
      });
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
