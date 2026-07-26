// Thrown by a role/capability check (docs/access-control.md §4) — caught at
// the Server Action boundary and mapped to the `error` branch of
// ActionResult<T>, never left to surface as an unhandled exception.
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

// Thrown when a record doesn't exist OR isn't visible to the acting member —
// the two are deliberately indistinguishable to the caller (docs/access-control.md
// §5), so a query never leaks "it exists but you can't see it" via a different
// error shape than "it doesn't exist."
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { success: true, data: await fn() };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { success: false, error: error.message };
    }
    throw error;
  }
}
