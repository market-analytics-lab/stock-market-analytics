"use strict";

(() => {
  const root = document.documentElement;
  const chartPanel = document.getElementById("chart");
  const themeToggle = document.getElementById("theme-toggle");
  const fullscreenToggle = document.getElementById("fullscreen-toggle");
  const year = document.getElementById("year");

  function readSavedTheme() {
    try { return window.localStorage.getItem("spx-dashboard-theme"); }
    catch { return null; }
  }

  function applyTheme(theme, persist = true) {
    const resolved = theme === "light" ? "light" : "dark";
    root.dataset.theme = resolved;
    themeToggle.setAttribute("aria-label", `Switch to ${resolved === "dark" ? "light" : "dark"} theme`);
    if (persist) {
      try { window.localStorage.setItem("spx-dashboard-theme", resolved); }
      catch { /* Storage may be unavailable; chart still works. */ }
    }
  }

  applyTheme(readSavedTheme() || "dark", false);
  themeToggle.addEventListener("click", () => {
    applyTheme(root.dataset.theme === "dark" ? "light" : "dark");
  });

  function updateFullscreenButton() {
    const expanded = document.fullscreenElement === chartPanel;
    fullscreenToggle.setAttribute("aria-label", expanded ? "Exit chart fullscreen" : "Enter chart fullscreen");
    fullscreenToggle.title = expanded ? "Exit fullscreen" : "Fullscreen chart";
    const label = fullscreenToggle.querySelector("span");
    if (label) label.textContent = expanded ? "Exit" : "Expand";
  }

  if (document.fullscreenEnabled && chartPanel.requestFullscreen) {
    fullscreenToggle.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement === chartPanel) await document.exitFullscreen();
        else await chartPanel.requestFullscreen();
      } catch (error) {
        console.warn("Fullscreen unavailable:", error);
      }
      updateFullscreenButton();
    });
    document.addEventListener("fullscreenchange", updateFullscreenButton);
  } else {
    fullscreenToggle.hidden = true;
  }

  if (year) year.textContent = String(new Date().getFullYear());
})();
