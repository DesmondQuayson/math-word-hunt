import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AdminOperationDialog } from "./admin-operation-dialog";
import { AdminGuardedForm } from "./admin-guarded-form";

afterEach(() => cleanup());

function renderDialog(props: Partial<Parameters<typeof AdminOperationDialog>[0]> = {}) {
  const view = render(<AdminOperationDialog csrfToken="token" targetUserId="20000000-0000-4000-8000-000000000001" operation="sync-billing"
    idempotencyKey="phase8g:account:sync-billing:key" label="Sync with Stripe" description="Re-read Stripe." {...props} />);
  const form = view.container.querySelector("form") as HTMLFormElement;
  return { form, confirm: () => screen.getByRole("button", { hidden: true, name: /Confirm sync with stripe|Processing/ }) };
}

/** Dispatches a real submit event and reports whether it was allowed to continue. */
function submit(form: HTMLFormElement): boolean {
  const event = new Event("submit", { bubbles: true, cancelable: true });
  fireEvent(form, event);
  return !event.defaultPrevented;
}

describe("Phase 2B double-submit protection", () => {
  it("locks the confirmation after the first submission", () => {
    const { form, confirm } = renderDialog();
    expect(confirm()).toHaveProperty("disabled", false);
    expect(submit(form), "the first submission goes through").toBe(true);
    expect(confirm().textContent).toBe("Processing…");
    expect(confirm()).toHaveProperty("disabled", true);
    expect(form.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("button", { hidden: true, name: "Go back" })).toHaveProperty("disabled", true);
  });

  it("cancels a rapid second submission (double click)", () => {
    const { form } = renderDialog();
    expect(submit(form)).toBe(true);
    expect(submit(form), "the second submission is cancelled").toBe(false);
    expect(submit(form)).toBe(false);
  });

  it("becomes usable again when the page is restored from the back/forward cache", () => {
    const { form, confirm } = renderDialog();
    submit(form);
    const restored = new Event("pageshow") as PageTransitionEvent;
    Object.defineProperty(restored, "persisted", { value: true });
    fireEvent(window, restored);
    expect(confirm()).toHaveProperty("disabled", false);
    expect(submit(form)).toBe(true);
  });

  it("asks for an authenticator code only when step-up is required", () => {
    const { form } = renderDialog({ operation: "suspend", label: "Suspend account", stepUpRequired: true, reasonRequired: true });
    const code = form.querySelector("input[name=stepUpCode]") as HTMLInputElement;
    expect(code).not.toBeNull();
    expect(code.required).toBe(true);
    expect(code.getAttribute("autocomplete")).toBe("one-time-code");
    expect(code.getAttribute("inputmode")).toBe("numeric");
    expect(screen.getByLabelText("Authenticator code")).toBe(code);
    cleanup();
    const plain = renderDialog();
    expect(plain.form.querySelector("input[name=stepUpCode]")).toBeNull();
  });

  it("guards the other admin mutation forms the same way", () => {
    const view = render(<AdminGuardedForm action="/admin/operations/retention" submitLabel="Run bounded retention" submitClassName="admin-secondary-action"><input name="reason" defaultValue="Scheduled retention" /></AdminGuardedForm>);
    const form = view.container.querySelector("form") as HTMLFormElement;
    expect(submit(form)).toBe(true);
    expect(submit(form)).toBe(false);
    expect(screen.getByRole("button", { name: "Processing…" })).toHaveProperty("disabled", true);
  });
});
