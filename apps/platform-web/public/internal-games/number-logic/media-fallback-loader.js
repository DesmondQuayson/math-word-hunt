(function loadNumberLogicMediaFallback() {
  "use strict";

  if (typeof window.AudioContext === "function") return;
  if (typeof window.webkitAudioContext === "function") {
    // The approved bundle consumes the standards name. Safari's prefixed native
    // constructor is still Web Audio, so expose that constructor without loading
    // or installing the HTMLMedia fallback.
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      writable: true,
      value: window.webkitAudioContext
    });
    return;
  }

  // This parser-blocking loader runs before the module bundle. document.write is
  // intentionally limited to this parse-time, same-origin capability fallback.
  document.write('<script src="./media-fallback.js" data-number-logic-media-fallback><\/script>');
})();
