// Tests for the "Generate Program Readout" workflow after the HITL contract was
// frozen in the UI. Two paths are covered:
//   1. Happy path: run -> poll -> awaiting_approval -> approve -> approved.
//   2. Halted path: forcing the demo toggle drives run -> halted with a diagnostic.
// The stub polls a couple of times before pausing, so we wait on the observable
// states rather than on fixed timers.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("Generate Program Readout", () => {
  it("runs, polls to awaiting approval, then approves to a final readout", async () => {
    const user = userEvent.setup();
    render(<App />);

    // Banner starts idle.
    expect(screen.getByText(/Run status:/i)).toBeInTheDocument();
    expect(screen.getByText("idle")).toBeInTheDocument();

    // Seeded input: an optional focus hint.
    const focus = screen.getByLabelText(/Optional focus or criteria/i);
    await user.type(focus, "emphasize capacity risks");
    expect(focus).toHaveValue("emphasize capacity risks");

    // Run the crew.
    await user.click(screen.getByRole("button", { name: /^Run$/i }));

    // The poll loop reaches the HITL pause: the DRAFT readout and decision
    // controls appear.
    await waitFor(
      () => expect(screen.getByText(/Draft executive readout/i)).toBeInTheDocument(),
      { timeout: 6000 },
    );
    // "Awaiting your approval" shows in both the banner and the HITL note.
    expect(screen.getAllByText(/Awaiting your approval/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: /Priority RAG rollup/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Campaign Engine/).length).toBeGreaterThan(0);

    // Approve the DRAFT.
    await user.click(screen.getByRole("button", { name: /^Approve$/i }));

    // The run becomes approved and the final readout is shown.
    await waitFor(
      () => expect(screen.getByText(/this readout is now final/i)).toBeInTheDocument(),
      { timeout: 6000 },
    );
    expect(screen.getByText(/Status: APPROVED/i)).toBeInTheDocument();

    // The approved run appears in the session History list.
    expect(screen.getByRole("heading", { name: /History/i })).toBeInTheDocument();
  });

  it("halts with a diagnostic on the forced demo path", async () => {
    const user = userEvent.setup();
    render(<App />);

    // Force the HALTED demo path.
    await user.click(screen.getByLabelText(/Force halted path/i));
    await user.click(screen.getByRole("button", { name: /^Run$/i }));

    // The poll loop reaches the halted state and surfaces the diagnostic.
    await waitFor(
      () => expect(screen.getByText(/Run halted on/i)).toBeInTheDocument(),
      { timeout: 6000 },
    );
    expect(screen.getByText(/Capacity\/Burn/i)).toBeInTheDocument();
    expect(screen.getByText("halted")).toBeInTheDocument();
  });
});
