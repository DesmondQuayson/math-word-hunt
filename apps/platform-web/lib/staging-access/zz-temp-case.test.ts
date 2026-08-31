import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/environment/server", () => ({
  getServerEnvironment: () => ({ identity: "production-platform", billingAvailable: true })
}));
vi.mock("@/lib/supabase/proxy", () => ({
  refreshSupabaseSession: () => NextResponse.next()
}));

import { proxy } from "@/proxy";

const originalEnvironment = { ...process.env };
const token = "C".repeat(43);

afterEach(() => { process.env = { ...originalEnvironment }; });

describe("case variants", () => {
  it("probe", async () => {
    process.env.MVH_APP_ENVIRONMENT = "production-platform";
    process.env.MVH_STAGING_ACCESS_REQUIRED = "true";
    process.env.MVH_STAGING_ACCESS_TOKEN = token;
    const uuid = "11111111-1111-4111-8111-111111111111";
    const ticket = `${"A".repeat(80)}.${"B".repeat(43)}`;
    for (const pathname of [
      `/games/${uuid}/runtime/assets/${ticket}/x.js`,
      `/Games/${uuid}/runtime/assets/${ticket}/x.js`,
      `/games/${uuid}/Runtime/assets/${ticket}/x.js`,
      `/ADMIN/GAMES/${uuid.toUpperCase()}/PREVIEW/assets/${ticket}/x.js`,
      `/games/${uuid}/runtime/ASSETS/${ticket}/x.js`
    ]) {
      const r = await proxy(new NextRequest(`https://staging.example.invalid${pathname}`));
      console.log(r.status, pathname.slice(0, 48));
    }
    expect(true).toBe(true);
  });
});
