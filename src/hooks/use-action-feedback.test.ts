import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { toast } from "sonner";
import { useActionFeedback } from "./use-action-feedback";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("useActionFeedback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("calls toast.success with the message when an action resolves", async () => {
    const { result } = renderHook(() => useActionFeedback());

    await act(async () => {
      result.current.run(() => Promise.resolve(), "Category archived");
    });

    expect(toast.success).toHaveBeenCalledWith("Category archived");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("stays silent on success when no message is given", async () => {
    const { result } = renderHook(() => useActionFeedback());

    await act(async () => {
      result.current.run(() => Promise.resolve());
    });

    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("calls toast.error with the thrown message when an action rejects", async () => {
    const { result } = renderHook(() => useActionFeedback());

    await act(async () => {
      result.current.run(() => Promise.reject(new Error("Not authenticated")), "Category archived");
    });

    expect(toast.error).toHaveBeenCalledWith("Not authenticated");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("falls back to a generic message for a non-Error rejection", async () => {
    const { result } = renderHook(() => useActionFeedback());

    await act(async () => {
      result.current.run(() => Promise.reject("plain string failure"));
    });

    expect(toast.error).toHaveBeenCalledWith("Something went wrong.");
  });
});
