import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthorizedCodeForm } from "./authorized-code-form";

vi.mock("@/app/school-access-actions", () => ({
  authorizeSchoolAccessAction: vi.fn(async (state) => state)
}));

afterEach(cleanup);

describe("inline authorized-code access", () => {
  it("renders the masked field immediately on the same screen with preserved destination", () => {
    const { container } = render(<AuthorizedCodeForm nextDestination="/map-prep" />);
    expect(screen.getByRole("heading", { name: "Enter authorized code to access MathNexa" })).toBeTruthy();
    const input = screen.getByLabelText(/^Authorized code/) as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.name).toBe("authorizedCode");
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    expect((container.querySelector('input[name="next"]') as HTMLInputElement | null)?.value).toBe("/map-prep");
    expect(container.textContent).not.toContain("AESM");
    expect(container.textContent).not.toContain("Use the code provided by your school. No personal account is created.");
    expect(container.textContent).not.toContain("Authorized staff access");
    expect(container.textContent).not.toContain("School access");
  });

  it("supports the compact account-control presentation without hiding the field", () => {
    const { container } = render(<AuthorizedCodeForm nextDestination="/account" compact />);
    expect(container.querySelector(".authorized-access-panel--compact")).toBeTruthy();
    expect(screen.getByLabelText(/^Authorized code/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  });
});
