import { expect, it } from "vitest";
import { createSafeEvent } from "./events";
it("accepts structured low-PII events", () => expect(createSafeEvent({category:"health",severity:"info",code:"preview.ready",correlationId:"safe_id_123"})).not.toBeNull());
it.each(["password","accessToken","service_role_secret","email"])("rejects forbidden detail key %s", (key) => expect(createSafeEvent({category:"authorization",severity:"warning",code:"access.denied",correlationId:"safe_id_123",detail:{[key]:"x"}})).toBeNull());
it("rejects log injection", () => expect(createSafeEvent({category:"database",severity:"error",code:"db.failure",correlationId:"safe_id_123",detail:{operation:"read\nforged"}})).toBeNull());

