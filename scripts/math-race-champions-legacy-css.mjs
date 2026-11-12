// What an older browser makes of a stylesheet: every declaration it cannot
// parse is dropped, exactly as CSS error handling requires, and every rule
// whose selector it cannot parse is dropped whole.
//
// Interactive panels in classrooms often run a Chromium several years old.
// The browser tests serve the game's stylesheet through this to hold the
// layout on such a browser (the Smart Board fault of 2026-11: a board height in
// `dvh` with no fallback left the tracks with no room).
//
// `legacyCss(text, "chrome-80")` models Chrome 80 to 104 (Android 8 to 11
// era panels): no dynamic viewport units, no container queries or their
// units, no :has(), no `inset`, no `aspect-ratio`, no `text-wrap`, no
// individual transform properties.

const UNSUPPORTED = Object.freeze({
  "chrome-80": Object.freeze({
    // In a declaration's value.
    values: [/\d(?:dvh|dvw|svh|svw|lvh|lvw|dvmin|dvmax|cqw|cqh|cqi|cqb|cqmin|cqmax)\b/, /\bcolor-mix\(/],
    // Whole properties.
    properties: [/^inset(?:-block|-inline)?$/, /^aspect-ratio$/, /^text-wrap$/, /^container(?:-type|-name)?$/, /^(?:translate|rotate|scale)$/, /^accent-color$/, /^overflow-clip-margin$/],
    // In a selector.
    selectors: [/:has\(/, /:is\(/, /:where\(/],
    // At-rules.
    atRules: [/^@container\b/, /^@layer\b/]
  })
});

/** Split a stylesheet into top-level blocks, keeping at-rule nesting. */
function transformBlock(text, model) {
  let out = "";
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf("{", index);
    if (open < 0) {
      out += text.slice(index);
      break;
    }
    // Find the matching close brace.
    let depth = 1;
    let close = open + 1;
    while (close < text.length && depth > 0) {
      if (text[close] === "{") depth += 1;
      else if (text[close] === "}") depth -= 1;
      close += 1;
    }
    const prelude = text.slice(index, open);
    const body = text.slice(open + 1, close - 1);
    const selector = prelude.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (selector.startsWith("@")) {
      if (model.atRules.some((rule) => rule.test(selector))) {
        // Dropped whole.
      } else if (/^@(media|supports)\b/.test(selector)) {
        out += `${prelude}{${transformBlock(body, model)}}`;
      } else {
        // @keyframes, @font-face and the like: kept as written.
        out += `${prelude}{${body}}`;
      }
    } else if (model.selectors.some((pattern) => pattern.test(selector))) {
      // One unparseable selector invalidates the whole rule.
    } else {
      const kept = body
        .split(";")
        .filter((declaration) => {
          const clean = declaration.replace(/\/\*[\s\S]*?\*\//g, "").trim();
          if (!clean) return true;
          const colon = clean.indexOf(":");
          if (colon < 0) return true;
          const property = clean.slice(0, colon).trim().toLowerCase();
          const value = clean.slice(colon + 1);
          if (property.startsWith("--")) return true;
          if (model.properties.some((pattern) => pattern.test(property))) return false;
          return !model.values.some((pattern) => pattern.test(value));
        })
        .join(";");
      out += `${prelude}{${kept}}`;
    }
    index = close;
  }
  return out;
}

export function legacyCss(text, target = "chrome-80") {
  const model = UNSUPPORTED[target];
  if (!model) throw new RangeError(`Unknown legacy target: ${target}`);
  return transformBlock(text, model);
}

/** Every declaration the target would drop, for a report: [{ selector, declaration }]. */
export function droppedDeclarations(text, target = "chrome-80") {
  const model = UNSUPPORTED[target];
  const dropped = [];
  const walk = (source) => {
    let index = 0;
    while (index < source.length) {
      const open = source.indexOf("{", index);
      if (open < 0) break;
      let depth = 1;
      let close = open + 1;
      while (close < source.length && depth > 0) {
        if (source[close] === "{") depth += 1;
        else if (source[close] === "}") depth -= 1;
        close += 1;
      }
      const selector = source.slice(index, open).replace(/\/\*[\s\S]*?\*\//g, "").trim();
      const body = source.slice(open + 1, close - 1);
      if (/^@(media|supports)\b/.test(selector)) walk(body);
      else if (selector.startsWith("@")) {
        if (model.atRules.some((rule) => rule.test(selector))) dropped.push({ selector, declaration: "(whole rule)" });
      } else if (model.selectors.some((pattern) => pattern.test(selector))) dropped.push({ selector, declaration: "(whole rule)" });
      else {
        for (const declaration of body.split(";")) {
          const clean = declaration.replace(/\/\*[\s\S]*?\*\//g, "").trim();
          const colon = clean.indexOf(":");
          if (!clean || colon < 0) continue;
          const property = clean.slice(0, colon).trim().toLowerCase();
          if (property.startsWith("--")) continue;
          if (model.properties.some((pattern) => pattern.test(property)) || model.values.some((pattern) => pattern.test(clean.slice(colon + 1)))) dropped.push({ selector: selector.replace(/\s+/g, " "), declaration: clean.replace(/\s+/g, " ") });
        }
      }
      index = close;
    }
  };
  walk(text);
  return dropped;
}
