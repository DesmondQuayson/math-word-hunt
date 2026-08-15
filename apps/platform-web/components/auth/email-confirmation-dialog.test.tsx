import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EmailConfirmationDialog } from "./email-confirmation-dialog";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/app/auth-actions", () => ({
  checkEmailConfirmationAction: vi.fn(async (state) => state),
  resendConfirmationAction: vi.fn(async (state) => state)
}));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

afterEach(cleanup);

describe("email confirmation dialog", () => {
  it("announces the confirmation step without exposing the full address", async () => {
    render(<EmailConfirmationDialog maskedEmail="d••••••@gmail.com" />);
    await waitFor(() => expect(screen.getByRole("dialog").hasAttribute("open")).toBe(true));
    expect(screen.getByRole("heading", { name: "Check your email" })).toBeTruthy();
    expect(screen.getByText(/We sent a confirmation link/).textContent).toContain("d••••••@gmail.com");
    expect(screen.getByRole("button", { name: "I've confirmed my email" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Resend confirmation email" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue browsing" })).toBeTruthy();
  });
});
