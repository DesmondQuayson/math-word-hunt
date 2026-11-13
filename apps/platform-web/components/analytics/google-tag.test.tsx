import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GoogleTag } from "@/components/analytics/google-tag";
import {
  GOOGLE_TAG_CONTAINER_ID,
  GOOGLE_TAG_INITIALIZATION,
  GOOGLE_TAG_SCRIPT_URL,
  isGoogleTagEnabled
} from "@/lib/analytics/google-tag";

const appRoot = resolve(__dirname, "../..");

describe("Google tag", () => {
  it("loads the MathNexa Google Ads container", () => {
    expect(GOOGLE_TAG_CONTAINER_ID).toBe("GTM-53VDQ6ZL");
    expect(GOOGLE_TAG_SCRIPT_URL).toBe("https://www.googletagmanager.com/gtm.js?id=GTM-53VDQ6ZL");
  });

  it("renders Google's installation code: one async loader and the dataLayer initialisation", () => {
    const html = renderToStaticMarkup(<GoogleTag />);
    expect(html).toContain('<script async="" src="https://www.googletagmanager.com/gtm.js?id=GTM-53VDQ6ZL"></script>');
    expect(html).toContain("window.dataLayer = window.dataLayer || [];");
    expect(html).toContain("function gtag(){dataLayer.push(arguments);}");
    expect(html).toContain("gtag('js', new Date());");
    expect(html.match(/googletagmanager/g)).toHaveLength(1);
  });

  it("keeps whatever is already queued in dataLayer", () => {
    const queued = { event: "already-queued" };
    const scope = { dataLayer: [queued] as unknown[] } as { dataLayer: unknown[] };
    // Run the shipped text with `window` bound to a stand-in global.
    new Function("window", `with (window) { ${GOOGLE_TAG_INITIALIZATION} }`)(scope);
    expect(scope.dataLayer).toHaveLength(2);
    expect(scope.dataLayer[0]).toBe(queued);
    expect(Array.from(scope.dataLayer[1] as ArrayLike<unknown>)[0]).toBe("js");
  });

  it("runs only on MathNexa builds deployed on Vercel", () => {
    expect(isGoogleTagEnabled(true, { VERCEL_ENV: "production" })).toBe(true);
    expect(isGoogleTagEnabled(true, { VERCEL_ENV: "preview" })).toBe(true);
    expect(isGoogleTagEnabled(true, {})).toBe(false);
    expect(isGoogleTagEnabled(true, { VERCEL_ENV: "development" })).toBe(false);
    expect(isGoogleTagEnabled(false, { VERCEL_ENV: "production" })).toBe(false);
  });

  it("is rendered in exactly one place: the root layout's head", () => {
    const layout = readFileSync(resolve(appRoot, "app/layout.tsx"), "utf8");
    expect(layout).toContain("<head>{googleTag ? <GoogleTag /> : null}</head>");
    const sources = execFileSync("git", ["ls-files", "app", "components", "lib"], { cwd: appRoot, encoding: "utf8" })
      .split(/\r?\n/)
      .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path));
    const users = sources.filter((path) => readFileSync(resolve(appRoot, path), "utf8").includes("<GoogleTag"));
    expect(users).toEqual(["app/layout.tsx"]);
  });
});
