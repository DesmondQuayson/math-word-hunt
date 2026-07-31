import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SignUpForm } from "./auth-forms";

vi.mock("@/app/auth-actions", () => ({
  signUpAction: vi.fn(async (state) => state),
  signInAction: vi.fn(async (state) => state),
  forgotPasswordAction: vi.fn(async (state) => state),
  updatePasswordAction: vi.fn(async (state) => state)
}));

afterEach(cleanup);

describe("account signup credentials", () => {
  it("keeps stable password controls with distinct accessible labels", () => {
    const { container } = render(<SignUpForm configured consumerMode />);
    const password = container.querySelector<HTMLInputElement>('input[name="password"]');
    const confirmation = container.querySelector<HTMLInputElement>('input[name="passwordConfirmation"]');

    expect(password?.id).toBe("signup-password");
    expect(confirmation?.id).toBe("signup-password-confirmation");
    expect(screen.getByLabelText(/^Password\b/)).toBe(password);
    expect(screen.getByLabelText(/^Confirm password\b/)).toBe(confirmation);
    expect(password?.labels?.item(0)?.htmlFor).toBe("signup-password");
    expect(confirmation?.labels?.item(0)?.htmlFor).toBe("signup-password-confirmation");
  });
});
