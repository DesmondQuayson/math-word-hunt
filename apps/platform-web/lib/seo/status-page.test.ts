import { afterEach, describe, expect, it } from "vitest";

import { generateMetadata } from "../../app/status/page";
import { PUBLIC_PAGE_SEO } from "./public-pages";

describe("service status page metadata", () => {
  const original = process.env.MVH_APP_ENVIRONMENT;
  afterEach(() => {
    if (original === undefined) delete process.env.MVH_APP_ENVIRONMENT;
    else process.env.MVH_APP_ENVIRONMENT = original;
  });

  it("keeps /status out of search results while links can still follow it", () => {
    process.env.MVH_APP_ENVIRONMENT = "production-platform";
    const metadata = generateMetadata();
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.description).toBe(PUBLIC_PAGE_SEO["/status"].description);
    expect(metadata.title).toBe("Service status");
  });
});
