(function () {
  const storageKey = "dark";
  const root = document.documentElement;
  const toggle = document.getElementById("theme-toggle");

  const supportsDarkMode = () =>
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches === true;

  const getInitialTheme = () => {
    const saved = localStorage.getItem(storageKey);

    if (saved === "false") {
      return "light";
    }

    if (saved === "true") {
      return "dark";
    }

    return supportsDarkMode() ? "dark" : "light";
  };

  const applyTheme = theme => {
    root.setAttribute("data-theme", theme);

    if (toggle) {
      const nextLabel =
        theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
      toggle.setAttribute("aria-label", nextLabel);
      toggle.setAttribute("title", nextLabel);
    }
  };

  let currentTheme = getInitialTheme();
  applyTheme(currentTheme);

  if (toggle) {
    toggle.addEventListener("click", () => {
      currentTheme = currentTheme === "dark" ? "light" : "dark";
      localStorage.setItem(storageKey, JSON.stringify(currentTheme === "dark"));
      applyTheme(currentTheme);
    });
  }
})();
