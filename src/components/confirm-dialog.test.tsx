import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { ConfirmDialog } from "./confirm-dialog";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

describe("ConfirmDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fires toast.success with the message and closes on a successful confirm (happy path)", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Cancel this renewal?"
        description="This can't be undone."
        confirmLabel="Cancel renewal"
        successMessage="Renewal cancelled"
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel renewal" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toast.success).toHaveBeenCalledWith("Renewal cancelled");
  });

  it("shows the error inline, never toasts, and keeps the dialog open when onConfirm rejects", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn().mockRejectedValue(new Error("Settled splits can't be voided."));

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Void this transaction?"
        description="This can't be undone."
        successMessage="Transaction voided"
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Settled splits can't be voided.")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("never toasts when no successMessage is given, even on success", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Close this household?"
        description="Every member loses access immediately."
        onConfirm={onConfirm}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(toast.success).not.toHaveBeenCalled();
  });
});
