import { expect, it, vi } from "vitest";
import { emitOperationalEvent } from "./server";
it("rate limits repeated safe events", () => { const emit=vi.fn(); const e={category:"authorization",severity:"warning",code:"access.denied",correlationId:"correlation_123"} as const; expect(emitOperationalEvent({emit},e,10000)).toBe(true); expect(emitOperationalEvent({emit},e,11000)).toBe(false); expect(emit).toHaveBeenCalledTimes(1); });
it("drops events containing secrets", () => expect(emitOperationalEvent({emit:vi.fn()},{category:"environment",severity:"error",code:"config.bad",correlationId:"correlation_456",detail:{secret:"no"}})).toBe(false));
