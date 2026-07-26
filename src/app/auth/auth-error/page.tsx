import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold">Link expired or invalid</h1>
      <p className="text-sm text-muted-foreground">
        This confirmation or reset link is no longer valid. Request a new one and try again.
      </p>
      <Link href="/login" className="text-sm underline underline-offset-4">
        Back to login
      </Link>
    </div>
  );
}
