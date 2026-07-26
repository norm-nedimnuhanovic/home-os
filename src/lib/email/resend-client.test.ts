import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendTransactionalEmail } from "./resend-client";

const send = vi.fn().mockResolvedValue({ id: "test" });
vi.mock("resend", () => ({
  Resend: vi.fn(function Resend(this: { emails: { send: typeof send } }) {
    this.emails = { send };
  }),
}));

describe("sendTransactionalEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("EMAIL_FROM", "Home OS <notifications@example.com>");
    vi.stubEnv("NODE_ENV", "test");
  });

  it("sends to the real recipient when EMAIL_DEV_REDIRECT_TO isn't set (happy path)", async () => {
    await sendTransactionalEmail({ to: "member@example.com", subject: "Hi", react: null as never });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "member@example.com", from: "Home OS <notifications@example.com>" }),
    );
  });

  it("redirects the envelope recipient outside production when EMAIL_DEV_REDIRECT_TO is set", async () => {
    vi.stubEnv("EMAIL_DEV_REDIRECT_TO", "dev@example.com");

    await sendTransactionalEmail({ to: "member@example.com", subject: "Hi", react: null as never });

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "dev@example.com" }));
  });

  it("never redirects in production, even if EMAIL_DEV_REDIRECT_TO is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EMAIL_DEV_REDIRECT_TO", "dev@example.com");

    await sendTransactionalEmail({ to: "member@example.com", subject: "Hi", react: null as never });

    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "member@example.com" }));
  });
});
