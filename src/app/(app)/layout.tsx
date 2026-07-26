import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Nav } from "@/components/app-shell/nav";
import { QuickCapture } from "@/components/app-shell/quick-capture";
import { CommandPalette } from "@/components/app-shell/command-palette";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await requireMember();
  if (!member) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col sm:flex-row">
      <nav className="flex shrink-0 flex-col gap-3 border-b p-3 sm:w-56 sm:border-b-0 sm:border-r sm:p-4">
        <div className="flex flex-row items-center justify-between gap-2 sm:flex-col sm:items-stretch">
          <Nav />
          <form action={logout}>
            <Button variant="ghost" size="sm" type="submit">
              Log out
            </Button>
          </form>
        </div>
        <QuickCapture />
        <CommandPalette />
      </nav>
      <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}
