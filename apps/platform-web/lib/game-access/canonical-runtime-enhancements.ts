import { MVH_AUDIO_RUNTIME_FILE } from "./mvh-audio-runtime-manifest.mjs";

const STYLESHEET = '<link rel="stylesheet" href="/game-suite/canonical-runtime.css" data-mathnexa-game-suite="styles">';
// The music credit sits inside the teacher controls: as the last element of
// the body it fell below the fixed-height game screen, where no learner could
// see or reach it during play. It is now the last teacher control on desktop
// and the Smart Board, and the last row of the Controls menu on phones.
const CREDIT = `<details class="mathnexa-music-credit" data-mathnexa-game-suite="credit">
  <summary>Credits</summary>
  <p>Music: “Cosmic Candy Catchers” by Eric Matyas — soundimage.org · CC BY 3.0</p>
</details>`;
// ONE version-atomic audio runtime (voice engine + music channel), injected
// under a content-hashed URL taken from the generated manifest. The two halves
// used to be separate scripts under stable names, and a browser or proxy
// holding a stale copy of just ONE of them executed a mismatched pair:
// pronunciation kept working while ducking silently died in production. A
// single content-addressed file removes that class of failure — one fetch,
// one generation, a new URL every build — so a cached older runtime can never
// satisfy a newer document.
//
// It must load in <head>, BEFORE the inline game script, so the game's
// speechSynthesis feature check finds the prebuilt-audio adapter, never the
// robotic browser voice. The music half defers itself to DOMContentLoaded,
// the moment its old end-of-body tag used to run.
const AUDIO_RUNTIME = `<script src="/game-suite/${MVH_AUDIO_RUNTIME_FILE}" data-mathnexa-game-suite="audio-runtime"></script>`;
// A revived game document must not keep playing. The browser's back/forward
// cache resurrects a top-level page FROM MEMORY -- no request, no-store
// notwithstanding (Safari especially) -- so a learner swiping back into the
// game gets the generation that document was born with, with its audio modules
// already torn down by their own pagehide cleanup. One reload on a persisted
// pageshow turns any revival into a normal fetch of the current document and
// therefore the current content-hashed runtime. A fresh load fires
// pageshow with persisted=false, so this can never loop.
const FRESHNESS =
  '<script data-mathnexa-game-suite="freshness">window.addEventListener("pageshow",function(event){if(event.persisted)location.reload();});</script>';
// Math Vocabulary Hunt was the only game with no way back to MathNexa — a
// navigational dead end reached from the homepage's most prominent link. The
// injected link matches the other games' Back to Games affordance. It lives IN
// the header bar's flow: as a fixed overlay it covered the brand on every
// screen and the New Puzzle control on phones. Phones show the compact
// "← Games"; the accessible name stays "Back to Games" everywhere.
const BACK_LINK =
  '<a class="mathnexa-back-link" data-mathnexa-game-suite="back" href="/games" aria-label="Back to Games"><span aria-hidden="true">←</span> <span class="mathnexa-back-prefix">Back to </span>Games</a>';
// Mobile gameplay fit: on phones the nine teacher controls collapse behind one
// Controls disclosure so the board and the word bank own the screen. Desktop
// and the Smart Board keep the full teacher bar and never show the toggle.
const CONTROLS_TOGGLE =
  '<button type="button" class="mathnexa-controls-toggle" data-mathnexa-game-suite="controls-toggle" aria-controls="mathnexaTeacherControls" aria-expanded="false"><span class="mathnexa-controls-icon" aria-hidden="true">☰</span> <span class="mathnexa-controls-label">Controls</span></button>';
// The disclosure behaviour, in the document itself so it can never version-skew
// from it. Progressive enhancement: until it runs the body carries no
// data-mathnexa-controls state, so the stylesheet keeps every teacher control
// visible and the toggle hidden. Escape and any press outside close the menu;
// an action closes it (focus returns to the toggle), while a switch
// (aria-pressed or an audio level) keeps it open so its new state can be read.
const LAYOUT =
  '<script data-mathnexa-game-suite="layout">(function(){' +
  "var toggle=document.querySelector('[data-mathnexa-game-suite=\"controls-toggle\"]'),bar=document.getElementById(\"mathnexaTeacherControls\");" +
  "if(!toggle||!bar)return;" +
  'function isOpen(){return toggle.getAttribute("aria-expanded")==="true";}' +
  'function set(open){toggle.setAttribute("aria-expanded",open?"true":"false");document.body.setAttribute("data-mathnexa-controls",open?"open":"closed");}' +
  "set(false);" +
  'toggle.addEventListener("click",function(){set(!isOpen());});' +
  'document.addEventListener("keydown",function(event){if(event.key==="Escape"&&isOpen()){set(false);toggle.focus();}});' +
  'document.addEventListener("pointerdown",function(event){if(isOpen()&&!bar.contains(event.target)&&!toggle.contains(event.target))set(false);},true);' +
  'bar.addEventListener("click",function(event){var button=event.target.closest?event.target.closest("button"):null;' +
  'if(!button||button.hasAttribute("aria-pressed")||button.classList.contains("audio-button"))return;' +
  "set(false);setTimeout(function(){if(bar.contains(document.activeElement)&&toggle.offsetParent)toggle.focus();},0);});" +
  "})();</script>";

const BREADCRUMB_BAR_OPEN = '<header class="breadcrumb-bar">';
const TEACHER_BAR_OPEN = '<header class="teacher-bar" aria-label="Teacher controls">';
const TEACHER_BAR_WITH_ID = '<header class="teacher-bar" id="mathnexaTeacherControls" aria-label="Teacher controls">';

function missingMarkers(): never {
  throw new Error("Canonical game enhancement markers are missing or duplicated.");
}

/** Insert markup immediately before the closing tag of the ONE header opened by `openTag`. */
function beforeHeaderClose(html: string, openTag: string, markup: string): string {
  const open = html.indexOf(openTag);
  if (open === -1 || html.indexOf(openTag, open + openTag.length) !== -1) missingMarkers();
  const close = html.indexOf("</header>", open + openTag.length);
  if (close === -1) missingMarkers();
  return `${html.slice(0, close)}  ${markup}\n  ${html.slice(close)}`;
}

export function enhanceCanonicalGameHtml(source: Buffer): Buffer {
  const html = source.toString("utf8");
  if (!html.includes("</head>") || !html.includes("</body>") || html.includes("data-mathnexa-game-suite")) missingMarkers();
  let enhanced = html.replace("</head>", `  ${STYLESHEET}\n  ${FRESHNESS}\n  ${AUDIO_RUNTIME}\n</head>`);
  enhanced = beforeHeaderClose(enhanced, BREADCRUMB_BAR_OPEN, CONTROLS_TOGGLE);
  enhanced = enhanced.replace(BREADCRUMB_BAR_OPEN, `${BREADCRUMB_BAR_OPEN}\n    ${BACK_LINK}`);
  enhanced = beforeHeaderClose(enhanced, TEACHER_BAR_OPEN, CREDIT);
  enhanced = enhanced.replace(TEACHER_BAR_OPEN, TEACHER_BAR_WITH_ID);
  enhanced = enhanced.replace("</body>", `  ${LAYOUT}\n</body>`);
  return Buffer.from(enhanced, "utf8");
}
