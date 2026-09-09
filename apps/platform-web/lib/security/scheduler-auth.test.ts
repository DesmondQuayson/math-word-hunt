import { describe, expect, it } from "vitest";

import { schedulerAuthorization } from "./scheduler-auth";

const SECRET = "scheduler-secret-0123456789";
const request = (authorization?: string) => new Request("https://example.test/api/internal/security/retention", {
  headers: authorization === undefined ? {} : { authorization }
});

describe("scheduler authorization", () => {
  it("fails closed without a usable secret, whatever the caller presents", () => {
    expect(schedulerAuthorization(request(`Bearer ${SECRET}`), {})).toBe("secret-missing");
    expect(schedulerAuthorization(request(`Bearer short`), { CRON_SECRET: "short" })).toBe("secret-missing");
  });

  it("authorizes only the exact bearer, compared whole", () => {
    const source = { CRON_SECRET: ` ${SECRET}\n` };
    expect(schedulerAuthorization(request(`Bearer ${SECRET}`), source)).toBe("authorized");
    expect(schedulerAuthorization(request(), source)).toBe("unauthorized");
    expect(schedulerAuthorization(request(SECRET), source)).toBe("unauthorized");
    expect(schedulerAuthorization(request(`Bearer ${SECRET}x`), source)).toBe("unauthorized");
    expect(schedulerAuthorization(request(`Bearer ${SECRET.slice(0, -1)}`), source)).toBe("unauthorized");
    expect(schedulerAuthorization(request(`bearer ${SECRET}`), source)).toBe("unauthorized");
  });
});
