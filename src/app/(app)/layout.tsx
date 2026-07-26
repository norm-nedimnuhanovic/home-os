import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import { logout } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Nav } from "@/components/app-shell/nav";
import { UserMenu } from "@/components/app-shell/user-menu";
import { QuickCapture } from "@/components/app-shell/quick-capture";
import { CommandPalette } from "@/components/app-shell/command-palette";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const member = await requireMember();
  if (!member) redirect("/login");

  // Rendered twice, not extracted into its own component: mobile keeps it
  // inline in the top icon strip (no vertical room for a real "bottom of
  // sidebar" there), desktop pins it to the bottom of the full-height
  // sidebar column via mt-auto — two different flex arrangements, so one
  // shared JSX fragment toggled by breakpoint is simpler than fighting a
  // single element's flex-direction/order across both.
  const userFooter = (
    <>
      <UserMenu displayName={member.displayName} role={member.role} colorTag={member.colorTag} />
      <form action={logout}>
        <Button variant="ghost" size="sm" type="submit">
          Log out
        </Button>
      </form>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col sm:flex-row">
      <nav className="flex shrink-0 flex-col gap-3 border-b border-sidebar-border bg-sidebar p-3 text-sidebar-foreground sm:sticky sm:top-0 sm:h-screen sm:w-56 sm:overflow-y-auto sm:border-b-0 sm:border-r sm:p-4">
        <div className="flex flex-row items-center justify-between gap-2 sm:flex-col sm:items-stretch">
          <Nav />
          <div className="flex shrink-0 items-center gap-2 sm:hidden">{userFooter}</div>
        </div>
        <QuickCapture />
        <CommandPalette />
        <div className="mt-auto hidden items-center justify-between gap-2 border-t border-sidebar-border pt-3 sm:flex">
          {userFooter}
        </div>
      </nav>
      <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}
