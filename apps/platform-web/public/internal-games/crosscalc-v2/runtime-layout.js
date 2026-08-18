(() => {
  "use strict";

  if (window.__MATHNEXA_CROSSCALC_LAYOUT__) return;

  const abortController = new AbortController();
  const signal = abortController.signal;
  let bootObserver = null;
  let contentObserver = null;
  let shell = null;
  let setupPanel = null;
  let pathsPanel = null;
  let setupTrigger = null;
  let pathsTrigger = null;
  let setupSummary = null;
  let pathsSummary = null;
  let expandedPanel = "none";

  function selectedText(select) {
    return select?.selectedOptions?.[0]?.textContent?.trim() ?? "";
  }

  function readSetupSummary() {
    const selects = setupPanel?.querySelectorAll("select") ?? [];
    const mode = selectedText(selects[0]);
    const difficulty = selectedText(selects[1]);
    if (mode && difficulty) return `${mode} · ${difficulty}`;
    const heading = document.querySelector(".stage-heading h2")?.textContent?.trim();
    return heading || "Choose a puzzle";
  }

  function readPathsSummary() {
    const count = pathsPanel?.querySelector(".panel-heading > span")?.textContent?.trim();
    return count ? `${count} proven` : "Live proof";
  }

  function updateSummaries() {
    const setupState = readSetupSummary();
    const pathsState = readPathsSummary();
    if (setupSummary) setupSummary.textContent = setupState;
    if (pathsSummary) pathsSummary.textContent = pathsState;
    setupTrigger?.setAttribute("aria-label", `Puzzle Setup · ${setupState}`);
    pathsTrigger?.setAttribute("aria-label", `Equation Paths · ${pathsState}`);
  }

  function applyExpandedState(nextPanel, returnFocus = false) {
    if (!setupPanel || !pathsPanel || !setupTrigger || !pathsTrigger || !shell) return false;
    const previousPanel = expandedPanel;
    expandedPanel = nextPanel === "setup" || nextPanel === "paths" ? nextPanel : "none";

    const setupOpen = expandedPanel === "setup";
    const pathsOpen = expandedPanel === "paths";
    setupPanel.hidden = !setupOpen;
    pathsPanel.hidden = !pathsOpen;
    setupTrigger.setAttribute("aria-expanded", String(setupOpen));
    pathsTrigger.setAttribute("aria-expanded", String(pathsOpen));
    shell.setAttribute("data-crosscalc-expanded-panel", expandedPanel);

    if (returnFocus && previousPanel !== "none" && expandedPanel === "none") {
      (previousPanel === "setup" ? setupTrigger : pathsTrigger).focus();
    }
    return true;
  }

  function createTrigger(kind, label) {
    const button = document.createElement("button");
    const labelElement = document.createElement("span");
    const summaryElement = document.createElement("span");
    const arrow = document.createElement("span");
    button.type = "button";
    button.className = `compact-disclosure__trigger compact-disclosure__trigger--${kind}`;
    button.id = `crosscalc-${kind}-trigger`;
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", `crosscalc-${kind}-panel`);
    labelElement.className = "compact-disclosure__label";
    labelElement.textContent = label;
    summaryElement.className = "compact-disclosure__summary";
    if (kind === "paths") {
      summaryElement.setAttribute("aria-live", "polite");
      summaryElement.setAttribute("aria-atomic", "true");
    }
    arrow.className = "compact-disclosure__arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "⌄";
    button.append(labelElement, summaryElement, arrow);
    return { button, summaryElement };
  }

  function initialize() {
    if (shell) return true;
    const nextShell = document.querySelector(".app-shell");
    const layout = document.querySelector(".game-layout");
    const mission = layout?.querySelector(":scope > .mission-panel");
    const equations = layout?.querySelector(":scope > .equation-panel");
    const stage = layout?.querySelector(":scope > .play-stage");
    if (!nextShell || !layout || !mission || !equations || !stage) return false;

    shell = nextShell;
    setupPanel = mission;
    pathsPanel = equations;
    setupPanel.id = "crosscalc-setup-panel";
    pathsPanel.id = "crosscalc-paths-panel";
    setupPanel.setAttribute("data-compact-panel", "setup");
    pathsPanel.setAttribute("data-compact-panel", "paths");
    const nativeSetupTitle = setupPanel.querySelector("h1");
    nativeSetupTitle?.setAttribute("role", "heading");
    nativeSetupTitle?.setAttribute("aria-level", "2");

    const consoleElement = document.createElement("section");
    consoleElement.className = "puzzle-console";
    consoleElement.setAttribute("aria-label", "Puzzle controls and equation details");
    const pageTitle = document.createElement("h1");
    pageTitle.className = "sr-only compact-game-title";
    pageTitle.textContent = "CrossCalc connected arithmetic puzzle";
    const setup = createTrigger("setup", "Puzzle Setup");
    const paths = createTrigger("paths", "Equation Paths");
    setupTrigger = setup.button;
    pathsTrigger = paths.button;
    setupSummary = setup.summaryElement;
    pathsSummary = paths.summaryElement;
    consoleElement.append(pageTitle, setupTrigger, pathsTrigger);
    layout.insertBefore(consoleElement, setupPanel);

    setupTrigger.addEventListener("click", () => {
      applyExpandedState(expandedPanel === "setup" ? "none" : "setup");
    }, { signal });
    pathsTrigger.addEventListener("click", () => {
      applyExpandedState(expandedPanel === "paths" ? "none" : "paths");
    }, { signal });
    setupPanel.addEventListener("change", updateSummaries, { signal });

    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || expandedPanel === "none") return;
      event.preventDefault();
      applyExpandedState("none", true);
    }, { signal });

    contentObserver = new MutationObserver(updateSummaries);
    contentObserver.observe(setupPanel, { childList: true, characterData: true, subtree: true });
    contentObserver.observe(pathsPanel, { childList: true, characterData: true, subtree: true });
    contentObserver.observe(stage.querySelector(".stage-heading") ?? stage, {
      childList: true,
      characterData: true,
      subtree: true
    });

    shell.setAttribute("data-crosscalc-layout", "compact");
    updateSummaries();
    applyExpandedState("none");
    bootObserver?.disconnect();
    bootObserver = null;
    return true;
  }

  window.__MATHNEXA_CROSSCALC_LAYOUT__ = Object.freeze({
    initialize,
    setExpanded(panel) {
      return initialize() && applyExpandedState(panel);
    },
    snapshot() {
      return Object.freeze({
        initialized: Boolean(shell),
        expandedPanel,
        setupExpanded: setupTrigger?.getAttribute("aria-expanded") === "true",
        pathsExpanded: pathsTrigger?.getAttribute("aria-expanded") === "true",
        setupSummary: setupSummary?.textContent ?? "",
        pathsSummary: pathsSummary?.textContent ?? ""
      });
    }
  });

  window.addEventListener("pageshow", updateSummaries, { signal });
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) return;
    bootObserver?.disconnect();
    contentObserver?.disconnect();
    abortController.abort();
  }, { signal });

  if (!initialize()) {
    bootObserver = new MutationObserver(initialize);
    bootObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
