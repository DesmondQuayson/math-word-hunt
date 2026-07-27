import { expect, it } from "vitest";
import { renderEmailTemplate } from "./templates";
it("renders accessible plain and HTML copy", () => { const value=renderEmailTemplate("deletion-requested",{teacherName:"Teacher",applicationOrigin:"https://preview.example.invalid"}); expect(value?.text).toContain("No permanent deletion"); expect(value?.html).toContain("<a href="); });
it("escapes template input", () => expect(renderEmailTemplate("cancellation",{teacherName:"<script>",applicationOrigin:"https://preview.example.invalid"})?.html).not.toContain("<script>"));
it.each(["javascript:alert(1)","https://safe.invalid/redirect","https://safe.invalid@evil.invalid"])("rejects unsafe origin %s", (applicationOrigin) => expect(renderEmailTemplate("billing-support",{teacherName:"Teacher",applicationOrigin})).toBeNull());

