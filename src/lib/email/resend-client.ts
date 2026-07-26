import "server-only";
import { Resend } from "resend";
import type { ReactElement } from "react";

// Constructed lazily, inside the function below, not at module scope — the
// Resend SDK throws "Missing API key" the moment it's instantiated with an
// empty string, and a module-scope `new Resend(...)` would then throw the
// instant anything merely *imports* this file (e.g. `next build`'s page-
// data-collection phase for every Route Handler that transitively imports
// it), even in an environment with no RESEND_API_KEY configured yet and no
// intention of ever actually sending. Only calling this function should
// ever require a real key, never just importing the module.
function getResendClient() {
  return new Resend(process.env.RESEND_API_KEY);
}

/**
 * The one function that ever calls the Resend SDK directly. Every email
 * this app sends — reminder firing, digest, anything — goes through this,
 * never a second ad-hoc Resend client instantiated elsewhere.
 *
 * ROADMAP.md: no simulated/logged sends, ever — including in dev.
 * EMAIL_DEV_REDIRECT_TO only ever changes the envelope recipient outside
 * production; every environment still makes a real Resend API call.
 */
export async function sendTransactionalEmail(input: { to: string; subject: string; react: ReactElement }) {
  const to =
    process.env.NODE_ENV === "production" || !process.env.EMAIL_DEV_REDIRECT_TO
      ? input.to
      : process.env.EMAIL_DEV_REDIRECT_TO;

  return getResendClient().emails.send({
    from: process.env.EMAIL_FROM!,
    to,
    subject: input.subject,
    react: input.react,
  });
}
