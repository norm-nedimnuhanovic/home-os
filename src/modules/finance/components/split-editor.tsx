"use client";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type MemberOption = { id: string; displayName: string };
type Share = { memberId: string; amount: number };

// Shared by both "percentage" and "custom" split modes — the only
// difference is what the number typed into each row's input represents.
// "percentage" converts to a dollar amount right here, at the edit
// boundary, so only one canonical shape (dollar shares) ever reaches the
// schema/server (plan.md §3.4: sharePercent is "a derived display value,
// not authoritative").
export function SplitEditor({
  mode,
  totalAmount,
  members,
  value,
  onChange,
}: {
  mode: "percentage" | "custom";
  totalAmount: number;
  members: MemberOption[];
  value: Share[];
  onChange: (shares: Share[]) => void;
}) {
  function shareFor(memberId: string) {
    return value.find((s) => s.memberId === memberId);
  }

  function toggleMember(memberId: string) {
    if (shareFor(memberId)) {
      onChange(value.filter((s) => s.memberId !== memberId));
    } else {
      onChange([...value, { memberId, amount: 0 }]);
    }
  }

  function setRawValue(memberId: string, raw: number) {
    const amount = mode === "percentage" ? Math.round(((raw / 100) * totalAmount) * 100) / 100 : raw;
    onChange(value.map((s) => (s.memberId === memberId ? { ...s, amount } : s)));
  }

  const sum = value.reduce((acc, s) => acc + s.amount, 0);
  const matchesTotal = Math.round(sum * 100) === Math.round(totalAmount * 100);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {members.map((member) => {
          const selected = !!shareFor(member.id);
          return (
            <button key={member.id} type="button" className="cursor-pointer" onClick={() => toggleMember(member.id)}>
              <Badge variant={selected ? "default" : "outline"}>{member.displayName}</Badge>
            </button>
          );
        })}
      </div>
      {value.length > 0 && (
        <div className="flex flex-col gap-2">
          {value.map((share) => {
            const member = members.find((m) => m.id === share.memberId);
            const displayValue =
              mode === "percentage"
                ? totalAmount > 0
                  ? Math.round((share.amount / totalAmount) * 10000) / 100
                  : 0
                : share.amount;
            return (
              <div key={share.memberId} className="flex items-center gap-2">
                <span className="w-24 shrink-0 truncate text-sm">{member?.displayName}</span>
                <Input
                  type="number"
                  step="0.01"
                  value={displayValue}
                  onChange={(e) => setRawValue(share.memberId, Number(e.target.value))}
                  className="w-full"
                />
                <span className="w-4 shrink-0 text-sm text-muted-foreground">
                  {mode === "percentage" ? "%" : "$"}
                </span>
              </div>
            );
          })}
          <p className={matchesTotal ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
            Total: {sum.toFixed(2)} / {totalAmount.toFixed(2)}
          </p>
        </div>
      )}
    </div>
  );
}
