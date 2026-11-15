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
    expect(scope.dataLayer[0]).toBe(queued);
    expect(Array.from(scope.dataLayer.at(-1) as ArrayLike<unknown>)[0]).toBe("js");
  });

  /** Runs the shipped text for one visitor and returns what it queued. */
  function commands(visitor: { globalPrivacyControl?: boolean; cookie?: string } = {}) {
    const scope = {
      dataLayer: [] as unknown[],
      navigator: { globalPrivacyControl: visitor.globalPrivacyControl },
      document: { cookie: visitor.cookie ?? "" }
    };
    new Function("window", `with (window) { ${GOOGLE_TAG_INITIALIZATION} }`)(scope);
    return scope.dataLayer.map((entry) => Array.from(entry as ArrayLike<unknown>));
  }
  const denied = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" };
  const measured = { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "denied", analytics_storage: "granted", region: ["US"] };

  it("sets Consent Mode defaults before the tag starts: denied everywhere, measurement only in the United States", () => {
    expect(commands()).toEqual([
      ["consent", "default", denied],
      ["consent", "default", measured],
      ["set", "ads_data_redaction", true],
      ["js", expect.any(Date)]
    ]);
  });

  it("never grants ad personalisation to anyone", () => {
    for (const visitor of [{}, { globalPrivacyControl: true }, { cookie: "mathnexa-ad-choice=opt-out" }]) {
      for (const command of commands(visitor).filter((entry) => entry[0] === "consent")) {
        expect((command[2] as Record<string, unknown>).ad_personalization).toBe("denied");
      }
    }
  });

  it("grants nothing when the browser sends Global Privacy Control or the visitor turned ad measurement off", () => {
    for (const visitor of [{ globalPrivacyControl: true }, { cookie: "mathnexa-ad-choice=opt-out" }, { cookie: "theme=dark; mathnexa-ad-choice=opt-out; other=1" }]) {
      expect(commands(visitor), JSON.stringify(visitor)).toEqual([
        ["consent", "default", denied],
        ["set", "ads_data_redaction", true],
        ["js", expect.any(Date)]
      ]);
    }
    // A different cookie, or a look-alike name, is not an opt-out.
    expect(commands({ cookie: "xmathnexa-ad-choice=opt-out; mathnexa-ad-choice=opt-in" })).toHaveLength(4);
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
