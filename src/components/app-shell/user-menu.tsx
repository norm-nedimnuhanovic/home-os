export function UserMenu({
  displayName,
  role,
  colorTag,
}: {
  displayName: string;
  role: string;
  colorTag: string | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2" title={`${displayName} (${role})`}>
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
        style={{ backgroundColor: colorTag ?? "var(--sidebar-primary)" }}
        aria-hidden="true"
      >
        {displayName.charAt(0).toUpperCase()}
      </span>
      <div className="hidden min-w-0 sm:block">
        <p className="truncate text-sm font-medium">{displayName}</p>
        <p className="truncate text-xs text-sidebar-foreground/60 capitalize">{role}</p>
      </div>
    </div>
  );
}
