"use strict";

(() => {
  const root = document.documentElement;
  const chart = document.getElementById("spx-chart");
  const chartPanel = document.getElementById("chart");
  const intervalDescription = document.getElementById("interval-description");
  const intervalButtons = [...document.querySelectorAll("[data-interval]")];
  const themeToggle = document.getElementById("theme-toggle");
  const fullscreenToggle = document.getElementById("fullscreen-toggle");
  const year = document.getElementById("year");

  if (!chart) return;

  // Changing the interval attribute updates TradingView's web component in place.
  function setChartInterval(interval) {
    const selected = intervalButtons.find((button) => button.dataset.interval === interval);
    if (!selected) return;

    chart.setAttribute("interval", interval);
    intervalDescription.textContent = selected.dataset.label + " candles";

    for (const button of intervalButtons) {
      const active = button === selected;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  intervalButtons.forEach((button) => {
    button.addEventListener("click", () => setChartInterval(button.dataset.interval));
  });

  function readSavedTheme() {
    try {
      return window.localStorage.getItem("spx-dashboard-theme");
    } catch {
      return null;
    }
  }

  function saveTheme(theme) {
    try {
      window.localStorage.setItem("spx-dashboard-theme", theme);
    } catch {
      // The chart works even when browser storage is disabled.
    }
  }

  function applyTheme(theme, persist = true) {
    const resolved = theme === "light" ? "light" : "dark";
    root.dataset.theme = resolved;
    chart.setAttribute("theme", resolved);
    const next = resolved === "dark" ? "light" : "dark";
    themeToggle.setAttribute("aria-label", "Switch to " + next + " theme");
    themeToggle.title = "Switch to " + next + " theme";
    if (persist) saveTheme(resolved);
  }

  applyTheme(readSavedTheme() || "dark", false);
  themeToggle.addEventListener("click", () => {
    applyTheme(root.dataset.theme === "dark" ? "light" : "dark");
  });

  function updateFullscreenButton() {
    const expanded = document.fullscreenElement === chartPanel;
    fullscreenToggle.setAttribute("aria-label", expanded ? "Exit chart fullscreen" : "Enter chart fullscreen");
    fullscreenToggle.title = expanded ? "Exit fullscreen" : "Fullscreen chart";
    const text = fullscreenToggle.querySelector("span");
    if (text) text.textContent = expanded ? "Exit" : "Expand";
  }

  if (document.fullscreenEnabled && chartPanel.requestFullscreen) {
    fullscreenToggle.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement === chartPanel) {
          await document.exitFullscreen();
        } else {
          await chartPanel.requestFullscreen();
        }
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
