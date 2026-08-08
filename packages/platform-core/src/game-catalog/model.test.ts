import { describe, expect, it } from "vitest";
import { parseExternalGameDestination, parseGameLaunchTarget } from "./model";

describe("standalone game launch targets", () => {
  it("accepts only the canonical protected gateway and UUID hosted packages", () => {
    expect(parseGameLaunchTarget({ type: "canonical", route: "/play" })).toEqual({ type: "canonical", route: "/play" });
    expect(parseGameLaunchTarget({ type: "canonical", route: "/game/runtime/index.html" })).toBeNull();
    expect(parseGameLaunchTarget({ type: "hosted_package", packageId: "f8400000-0000-4000-8000-000000000002" })).not.toBeNull();
    expect(parseGameLaunchTarget({ type: "hosted_package", packageId: "../../game" })).toBeNull();
  });

  it("accepts only source-registered internal games", () => {
    expect(parseGameLaunchTarget({ type: "internal", key: "number-cross" }, [], ["number-cross"]))
      .toEqual({ type: "internal", key: "number-cross" });
    expect(parseGameLaunchTarget({ type: "internal", key: "number-cross" })).toBeNull();
    expect(parseGameLaunchTarget({ type: "internal", key: "unregistered" }, [], ["number-cross"])).toBeNull();
    expect(parseGameLaunchTarget({ type: "internal", key: "number-cross", module: "./arbitrary.js" }, [], ["number-cross"]))
      .toBeNull();
  });

  it("requires canonical HTTPS URLs on an exact server allowlist", () => {
    const hosts = ["games.example.edu"];
    expect(parseExternalGameDestination("https://games.example.edu/math", hosts)?.href).toBe("https://games.example.edu/math");
    for (const value of ["javascript:alert(1)", "data:text/html,bad", "file:///tmp/a", "//games.example.edu/math", "https://evil.example/math", "https://games.example.edu@evil.example/math", "https://games.example.edu/%2f%2fevil.example"]) {
      expect(parseExternalGameDestination(value, hosts)).toBeNull();
    }
  });
});
