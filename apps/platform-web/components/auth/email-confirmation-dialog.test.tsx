import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resendConfirmationAction } from "@/app/auth-actions";

import { ConfirmationReminder, EmailConfirmationDialog } from "./email-confirmation-dialog";

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

afterEach(() => { cleanup(); vi.useRealTimers(); });

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

  it("starts the provider's resend wait immediately after sign-up and announces only its start and end", async () => {
    vi.useFakeTimers();
    render(<EmailConfirmationDialog maskedEmail="d••••••@gmail.com" initialCooldownSeconds={60} />);
    const resend = screen.getByRole("button", { name: "Resend available in 60s" }) as HTMLButtonElement;
    expect(resend.disabled).toBe(true);
    const status = document.getElementById("confirmation-dialog-cooldown")!;
    expect(status.getAttribute("role")).toBe("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(resend.getAttribute("aria-describedby")).toBe("confirmation-dialog-cooldown");
    expect(status.textContent).toBe("You can request another email in 60 seconds.");
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(screen.getByRole("button", { name: "Resend available in 30s" })).toBeTruthy();
    // No per-second chatter in the live region.
    expect(status.textContent).toBe("You can request another email in 60 seconds.");
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect((screen.getByRole("button", { name: "Resend confirmation email" }) as HTMLButtonElement).disabled).toBe(false);
    expect(status.textContent).toBe("You can request another confirmation email now.");
  });

  it("counts down from the wait the server returns instead of offering a refused request", async () => {
    vi.mocked(resendConfirmationAction).mockResolvedValueOnce({ status: "error", message: "Wait 53 seconds before requesting another confirmation email.", cooldownSeconds: 53 });
    render(<ConfirmationReminder />);
    fireEvent.click(screen.getByRole("button", { name: "Resend confirmation email" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Resend in 53s" })).toBeTruthy());
    expect((screen.getByRole("button", { name: "Resend in 53s" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe("Wait 53 seconds before requesting another confirmation email.");
    expect(document.getElementById("confirmation-reminder-cooldown")!.textContent).toBe("You can request another email in 53 seconds.");
  });
});
