// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireProductAccess: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  })
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/access/server", () => ({ requireProductAccess: mocks.requireProductAccess }));

import WorksheetsLayout from "@/app/worksheets/layout";

describe("/worksheets entry (app/worksheets/layout.tsx)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends an entitled visitor to the ShowMe worksheet generator, only after the server access decision passed", async () => {
    mocks.requireProductAccess.mockResolvedValue({ decision: { allowed: true } });
    await expect(WorksheetsLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:https://showme.mathnexa.com/worksheets");
    expect(mocks.requireProductAccess).toHaveBeenCalledWith("/worksheets");
    expect(mocks.requireProductAccess.mock.invocationCallOrder[0]).toBeLessThan(mocks.redirect.mock.invocationCallOrder[0]);
  });

  it("never reaches the generator when the access decision redirects elsewhere", async () => {
    mocks.requireProductAccess.mockRejectedValue(new Error("NEXT_REDIRECT:/access?next=/worksheets"));
    await expect(WorksheetsLayout({ children: null })).rejects.toThrow("NEXT_REDIRECT:/access?next=/worksheets");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
