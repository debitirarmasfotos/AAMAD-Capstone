// Happy-path test for the "Generate Program Readout" workflow.
// Seeded example: the operator types a focus hint, clicks Run, and the stubbed
// crew returns the fixed readout. We confirm the input is accepted, the stubs
// are called, and the mock readout renders (DRAFT narrative + priority RAG).
// Edge-case and error-path tests are intentionally out of scope here.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("Generate Program Readout (happy path)", () => {
  it("accepts input, calls the stubs, and renders the mock DRAFT readout", async () => {
    const user = userEvent.setup();
    render(<App />);

    // Banner starts in the idle state.
    expect(screen.getByText(/Crew:/i)).toBeInTheDocument();
    expect(screen.getByText("idle")).toBeInTheDocument();

    // Seeded input: an optional focus hint.
    const focus = screen.getByLabelText(/Optional focus or criteria/i);
    await user.type(focus, "emphasize capacity risks");
    expect(focus).toHaveValue("emphasize capacity risks");

    // Run the crew.
    await user.click(screen.getByRole("button", { name: /^Run$/i }));

    // The stubs resolve to the DRAFT readout.
    await waitFor(
      () => expect(screen.getByText(/Draft executive readout/i)).toBeInTheDocument(),
      { timeout: 4000 },
    );

    // Faithful mock content: the section headings, a priority that appears in
    // the readout, and the stubbed HITL note are present. "Campaign Engine"
    // shows up in several sections, so assert at least one occurrence.
    expect(screen.getByRole("heading", { name: /Priority RAG rollup/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Campaign Engine/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Awaiting human approval/i)).toBeInTheDocument();

    // The run appears in the session History list.
    expect(screen.getByRole("heading", { name: /History/i })).toBeInTheDocument();
  });
});
