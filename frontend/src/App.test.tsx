import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

describe("Generate Program Readout", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("runs, polls to awaiting approval, then approves to a final readout", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);

    const runResponse = {
      runId: "run-123",
      status: "AWAITING_APPROVAL",
      draft: {
        markdown: "# Program Readout (DRAFT)\n\nSummary",
        summary: "Summary",
        bullets: ["One bullet"],
        status: "DRAFT",
      },
      stateSummary: {
        priorities: [],
        workstreams: [],
        risks: [],
      },
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ runId: "run-123", status: "running" }),
    } as Response);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => runResponse,
    } as Response);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ runId: "run-123", status: "APPROVED", finalReadout: { markdown: "# Final\n\nApproved" } }),
    } as Response);

    render(<App />);

    expect(screen.getByText(/Run status:/i)).toBeInTheDocument();
    expect(screen.getByText("idle")).toBeInTheDocument();

    const focus = screen.getByLabelText(/Optional focus or criteria/i);
    await user.type(focus, "emphasize capacity risks");

    await user.click(screen.getByRole("button", { name: /^Run$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/runs",
      expect.objectContaining({ method: "POST" }),
    ));

    await waitFor(() => expect(screen.getByText(/Draft executive readout/i)).toBeInTheDocument(), { timeout: 6000 });
    expect(screen.getAllByText(/Awaiting your approval/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: /^Approve$/i }));

    await waitFor(() => expect(screen.getByText(/this readout is now final/i)).toBeInTheDocument(), { timeout: 6000 });
    expect(screen.getByText(/Status: APPROVED/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /History/i })).toBeInTheDocument();
  });

  it("halts with a diagnostic when the backend reports HALTED", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ runId: "run-456", status: "running" }),
    } as Response);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        runId: "run-456",
        status: "HALTED",
        diagnostic: {
          failedWorkstream: "Capacity/Burn",
          reason: "Specialist failed after one idempotent retry; no DRAFT synthesized from partial data.",
        },
      }),
    } as Response);

    render(<App />);
    await user.click(screen.getByRole("button", { name: /^Run$/i }));

    await waitFor(() => expect(screen.getByText(/Run halted on/i)).toBeInTheDocument(), { timeout: 6000 });
    expect(screen.getByText(/Capacity\/Burn/i)).toBeInTheDocument();
    expect(screen.getByText("halted")).toBeInTheDocument();
  });
});
