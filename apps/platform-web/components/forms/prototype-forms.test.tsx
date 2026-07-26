import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { ActivityFormPrototype } from "./activity-form-prototype";
import { ClassFormPrototype } from "./class-form-prototype";

afterEach(cleanup);

describe("teacher workflow prototype forms", () => {
  it("moves focus to the class error summary and identifies the invalid field", async () => {
    const user = userEvent.setup();
    render(<ClassFormPrototype />);

    await user.click(screen.getByRole("button", { name: "Check class setup" }));

    const summary = await screen.findByTestId("error-summary");
    await waitFor(() => expect(document.activeElement).toBe(summary));
    expect(screen.getByLabelText(/Class name/).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("Enter a class name.")).toBeTruthy();
  });

  it("validates a class setup without implying that it was saved", async () => {
    const user = userEvent.setup();
    render(<ClassFormPrototype />);

    await user.type(screen.getByLabelText(/Class name/), "Math Language Lab");
    await user.click(screen.getByRole("button", { name: "Check class setup" }));

    expect(await screen.findByText("Nothing was saved.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Cancel and return to classes" }).getAttribute("href")
    ).toBe("/teacher/classes");
  });

  it("reports all missing activity choices in a focused summary", async () => {
    const user = userEvent.setup();
    render(<ActivityFormPrototype />);

    await user.click(screen.getByRole("button", { name: "Check activity setup" }));

    const summary = await screen.findByTestId("error-summary");
    await waitFor(() => expect(document.activeElement).toBe(summary));
    expect(screen.getAllByText("Choose a grade.")).toHaveLength(2);
    expect(screen.getAllByText("Choose a lesson.")).toHaveLength(2);
  });

  it("checks a complete activity without assigning or saving it", async () => {
    const user = userEvent.setup();
    render(<ActivityFormPrototype />);

    await user.selectOptions(screen.getByLabelText(/Grade/), "7");
    await user.selectOptions(screen.getByLabelText(/Topic/), "g7-probability");
    await user.selectOptions(screen.getByLabelText(/Lesson/), "g7-7-3");
    await user.selectOptions(screen.getByLabelText(/Game mode/), "team-hunt");
    await user.selectOptions(screen.getByLabelText(/Team count/), "4");
    await user.click(screen.getByRole("button", { name: "Check activity setup" }));

    expect(await screen.findByText("Nothing was assigned or saved.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Cancel and return to activities" }).getAttribute("href")
    ).toBe("/teacher/activities");
  });
});
