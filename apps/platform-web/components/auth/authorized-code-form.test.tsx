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
    expect(screen.getByRole("heading", { name: "Enter authorized code to sign in" })).toBeTruthy();
    const input = screen.getByLabelText(/^Authorized code/) as HTMLInputElement;
    expect(input.type).toBe("password");
    expect(input.name).toBe("authorizedCode");
    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    expect((container.querySelector('input[name="next"]') as HTMLInputElement | null)?.value).toBe("/map-prep");
    expect(container.textContent).not.toContain("AESM");
  });
});
