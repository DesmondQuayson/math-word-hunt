import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { enhanceCanonicalGameHtml } from "./canonical-runtime-enhancements";
import { MVH_AUDIO_RUNTIME_FILE } from "./mvh-audio-runtime-manifest.mjs";

describe("canonical game runtime enhancements", () => {
  it("injects exactly one version-atomic audio runtime and never the legacy standalone pair", async () => {
    const sourcePath = resolve(process.cwd(), "..", "..", "docs", "index.html");
    const before = await readFile(sourcePath);
    const enhanced = enhanceCanonicalGameHtml(before).toString("utf8");
    const after = await readFile(sourcePath);
    expect(after.equals(before)).toBe(true);

    // ONE audio authority, content-addressed, taken from the generated manifest.
    expect(enhanced.match(/data-mathnexa-game-suite="audio-runtime"/g)).toHaveLength(1);
    expect(enhanced).toContain(`src="/game-suite/${MVH_AUDIO_RUNTIME_FILE}"`);
    expect(MVH_AUDIO_RUNTIME_FILE).toMatch(/^mvh-audio-runtime\.[0-9a-f]{12}\.js$/);

    // The independent unhashed generations caused the production version-skew
    // failure. They must never come back as active scripts in the real game.
    expect(enhanced).not.toMatch(/<script[^>]*natural-voice\.js/);
    expect(enhanced).not.toMatch(/<script[^>]*math-vocabulary-music\.js/);
    expect(enhanced).not.toMatch(/data-mathnexa-game-suite="voice"/);
    expect(enhanced).not.toMatch(/data-mathnexa-game-suite="music"/);

    // The runtime must sit in <head>, ahead of the inline game script.
    expect(enhanced.indexOf(MVH_AUDIO_RUNTIME_FILE)).toBeLessThan(enhanced.indexOf("</head>"));

    // A back/forward-cache revival resurrects an old document FROM MEMORY with
    // its audio already torn down by pagehide cleanup — the document must
    // reload itself into the current generation instead of resuming stale.
    expect(enhanced.match(/data-mathnexa-game-suite="freshness"/g)).toHaveLength(1);
    const freshness = enhanced.match(/<script data-mathnexa-game-suite="freshness">([^<]*)<\/script>/)?.[1] ?? "";
    expect(freshness).toContain('addEventListener("pageshow"');
    expect(freshness, "reload must be gated on a persisted (bfcache) restore, never a plain load").toContain(
      "if(event.persisted)location.reload()"
    );
    expect(enhanced.indexOf('data-mathnexa-game-suite="freshness"')).toBeLessThan(enhanced.indexOf("</head>"));

    // Attribution and chrome are unchanged.
    expect(enhanced.match(/data-mathnexa-game-suite="credit"/g)).toHaveLength(1);
    expect(enhanced).toContain("Cosmic Candy Catchers");
    expect(enhanced).toContain("CC BY 3.0");
    expect(enhanced.match(/data-mathnexa-game-suite="back"/g)).toHaveLength(1);
  });

  it("fails closed instead of applying the adapter twice", () => {
    const html = Buffer.from('<html><head></head><body data-mathnexa-game-suite="already"></body></html>');
    expect(() => enhanceCanonicalGameHtml(html)).toThrow(/missing or duplicated/i);
  });

  it("fails closed when the header or teacher-bar markers the mobile layout relies on are missing", () => {
    const withoutHeaders = Buffer.from("<html><head></head><body><main></main></body></html>");
    expect(() => enhanceCanonicalGameHtml(withoutHeaders)).toThrow(/missing or duplicated/i);
    const duplicated = Buffer.from(
      '<html><head></head><body><header class="breadcrumb-bar"></header><header class="breadcrumb-bar"></header>' +
        '<header class="teacher-bar" aria-label="Teacher controls"></header></body></html>'
    );
    expect(() => enhanceCanonicalGameHtml(duplicated)).toThrow(/missing or duplicated/i);
  });
});

describe("mobile gameplay layout enhancements", () => {
  async function enhancedDocument(): Promise<string> {
    const source = await readFile(resolve(process.cwd(), "..", "..", "docs", "index.html"));
    return enhanceCanonicalGameHtml(source).toString("utf8");
  }

  function slice(html: string, openTag: string): string {
    const open = html.indexOf(openTag);
    return html.slice(open, html.indexOf("</header>", open));
  }

  it("puts Back to Games and the Controls toggle in the header bar's flow, and the credit in the teacher bar", async () => {
    const enhanced = await enhancedDocument();
    const breadcrumb = slice(enhanced, '<header class="breadcrumb-bar">');
    const teacher = slice(enhanced, '<header class="teacher-bar" id="mathnexaTeacherControls" aria-label="Teacher controls">');

    // No longer a fixed overlay injected at the top of <body>.
    expect(enhanced).not.toMatch(/<body[^>]*>\s*<a class="mathnexa-back-link"/);
    expect(breadcrumb).toContain('<a class="mathnexa-back-link" data-mathnexa-game-suite="back" href="/games" aria-label="Back to Games">');
    expect(breadcrumb).toContain('<span class="mathnexa-back-prefix">Back to </span>Games</a>');
    expect(breadcrumb.indexOf("mathnexa-back-link")).toBeLessThan(breadcrumb.indexOf('id="brandButton"'));

    expect(enhanced.match(/<button[^>]*data-mathnexa-game-suite="controls-toggle"/g)).toHaveLength(1);
    expect(breadcrumb).toContain('aria-controls="mathnexaTeacherControls" aria-expanded="false"');
    expect(breadcrumb).toContain('<span class="mathnexa-controls-label">Controls</span>');
    expect(breadcrumb.indexOf("controls-toggle")).toBeGreaterThan(breadcrumb.indexOf('id="breadcrumbs"'));

    expect(teacher).toContain('data-mathnexa-game-suite="credit"');
    expect(teacher.indexOf('data-mathnexa-game-suite="credit"')).toBeGreaterThan(teacher.indexOf('id="backLessonsButton"'));
    expect(enhanced.match(/id="mathnexaTeacherControls"/g)).toHaveLength(1);

    // The disclosure script runs after the game's own script, at the end of the body.
    const layout = enhanced.indexOf('data-mathnexa-game-suite="layout"');
    expect(enhanced.match(/data-mathnexa-game-suite="layout"/g)).toHaveLength(1);
    expect(layout).toBeGreaterThan(enhanced.indexOf("window.__MATH_WORD_HUNT__"));
    expect(layout).toBeLessThan(enhanced.indexOf("</body>"));
  });

  it("opens and closes the teacher Controls like a disclosure, and never hides controls before it runs", async () => {
    const enhanced = await enhancedDocument();
    const script = enhanced.match(/<script data-mathnexa-game-suite="layout">([\s\S]*?)<\/script>/)?.[1] ?? "";
    expect(script.length).toBeGreaterThan(100);

    // Parsed, never executed: DOMParser documents do not run scripts.
    const parsed = new DOMParser().parseFromString(enhanced.replace(/<script[\s\S]*?<\/script>/g, ""), "text/html");
    document.body.removeAttribute("data-mathnexa-controls");
    document.body.replaceChildren(...[...parsed.body.childNodes].map((node) => document.importNode(node, true)));
    // Progressive enhancement: until the script runs there is no state, so the
    // stylesheet shows every teacher control and hides the toggle.
    expect(document.body.hasAttribute("data-mathnexa-controls")).toBe(false);
    new Function(script)();

    const toggle = document.querySelector<HTMLButtonElement>('[data-mathnexa-game-suite="controls-toggle"]')!;
    const state = () => [document.body.getAttribute("data-mathnexa-controls"), toggle.getAttribute("aria-expanded")];
    expect(state()).toEqual(["closed", "false"]);

    toggle.click();
    expect(state()).toEqual(["open", "true"]);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(state()).toEqual(["closed", "false"]);
    expect(document.activeElement).toBe(toggle);

    // A switch keeps the menu open so its new state can be read …
    toggle.click();
    document.querySelector<HTMLButtonElement>("#timerButton")!.click();
    document.querySelector<HTMLButtonElement>("#soundButton")!.click();
    expect(state()).toEqual(["open", "true"]);
    // … an action closes it …
    document.querySelector<HTMLButtonElement>("#revealButton")!.click();
    expect(state()).toEqual(["closed", "false"]);
    // … and so does a press anywhere outside the menu.
    toggle.click();
    document.querySelector("#letterGrid")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(state()).toEqual(["closed", "false"]);
  });
});
