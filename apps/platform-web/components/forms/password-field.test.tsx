import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { PasswordField } from "./password-field";

afterEach(cleanup);

function renderField() {
  render(<form>
    <PasswordField id="pw" name="password" label="Password" required description="Use at least 8 characters." />
    <button type="submit">Submit</button>
  </form>);
  return screen.getByLabelText(/^Password/, { selector: "input" }) as HTMLInputElement;
}

describe("PasswordField", () => {
  it("begins hidden with a labelled show control", () => {
    const input = renderField();
    expect(input.type).toBe("password");
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle.getAttribute("type")).toBe("button");
    expect(toggle.getAttribute("aria-controls")).toBe("pw");
  });

  it("toggles password ↔ text by click without changing the typed value", async () => {
    const user = userEvent.setup();
    const input = renderField();
    await user.type(input, "Secret 123!");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.type).toBe("text");
    expect(input.value).toBe("Secret 123!");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input.type).toBe("password");
    expect(input.value).toBe("Secret 123!");
    expect(screen.getByRole("button", { name: "Show password" })).toBeTruthy();
  });

  it("works from the keyboard (Tab to the control, Enter and Space toggle)", async () => {
    const user = userEvent.setup();
    const input = renderField();
    await user.click(input);
    await user.keyboard("abc12345");
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Show password" }));
    await user.keyboard("{Enter}");
    expect(input.type).toBe("text");
    await user.keyboard(" ");
    expect(input.type).toBe("password");
    expect(input.value).toBe("abc12345");
  });

  it("never submits its form and re-hides on submit", async () => {
    const user = userEvent.setup();
    const input = renderField();
    let submits = 0;
    input.form!.addEventListener("submit", (event) => { event.preventDefault(); submits += 1; });
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(submits).toBe(0);
    expect(input.type).toBe("text");
    fireEvent.submit(input.form!);
    expect(input.type).toBe("password");
  });

  it("keeps the value out of storage", async () => {
    const user = userEvent.setup();
    localStorage.clear();
    sessionStorage.clear();
    const input = renderField();
    await user.type(input, "NotStored9");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("associates description and error with the input", () => {
    render(<PasswordField id="pw2" name="password" label="Password" description="Hint." error="Password is required." />);
    const input = screen.getByLabelText(/^Password/, { selector: "input" });
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("pw2-description pw2-error");
    expect(document.getElementById("pw2-error")?.textContent).toBe("Password is required.");
  });

  it("names the secret for non-password codes", () => {
    render(<PasswordField id="code" name="authorizedCode" label="Authorized code" secretName="code" />);
    expect(screen.getByRole("button", { name: "Show code" })).toBeTruthy();
  });
});
