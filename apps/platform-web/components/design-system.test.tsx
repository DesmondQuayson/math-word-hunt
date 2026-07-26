import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmptyState } from "./feedback/empty-state";
import { Notice } from "./feedback/notice";
import { PageHeader } from "./layout/page-header";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Divider } from "./ui/divider";

afterEach(cleanup);

describe("design-system components", () => {
  it("renders a native button and supports keyboard activation", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Start round</Button>);

    const button = screen.getByRole("button", { name: "Start round" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");

    button.focus();
    expect(document.activeElement).toBe(button);
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disables activation and exposes loading semantics", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save changes
      </Button>
    );

    const button = screen.getByRole("button", { name: /Save changes/ });
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("uses an alert only when a notice is live", () => {
    const { rerender } = render(
      <Notice label="Preview status">Static information</Notice>
    );
    expect(screen.getByLabelText("Preview status").getAttribute("role")).toBeNull();

    rerender(
      <Notice label="Connection error" tone="danger" live>
        Try again.
      </Notice>
    );
    expect(screen.getByRole("alert", { name: "Connection error" })).toBeTruthy();
  });

  it("keeps cards non-interactive and preserves valid structural elements", () => {
    const { container } = render(
      <main>
        <PageHeader
          eyebrow="Current experience"
          title="Vocabulary practice"
          description="A concise description."
        />
        <Card variant="interactive">
          <a href="/play">Open game</a>
        </Card>
        <Divider />
        <EmptyState
          symbol="Aa"
          headingId="empty-heading"
          title="Nothing here yet"
          description="This state is intentionally empty."
        />
      </main>
    );

    expect(screen.getByRole("heading", { level: 1, name: "Vocabulary practice" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open game" })).toBeTruthy();
    expect(screen.getByRole("separator").tagName).toBe("HR");
    expect(container.querySelectorAll("button a, a button")).toHaveLength(0);
    expect(container.querySelectorAll("[id='empty-heading']")).toHaveLength(1);
  });
});
