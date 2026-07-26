// Splits are computed in integer cents so they always sum to *exactly* the
// transaction amount — plain floating-point division would drift a cent on
// an uneven split (e.g. $10 / 3). Any remainder cent(s) go to the first
// member(s) in the list, in order.
export function computeEqualSplits(
  amount: number,
  memberIds: string[],
): { memberId: string; amount: number }[] {
  const totalCents = Math.round(amount * 100);
  const n = memberIds.length;
  const baseCents = Math.floor(totalCents / n);
  const remainderCents = totalCents - baseCents * n;

  return memberIds.map((memberId, index) => ({
    memberId,
    amount: (baseCents + (index < remainderCents ? 1 : 0)) / 100,
  }));
}

export function splitsSumMatches(amount: number, splits: { amount: number }[]): boolean {
  const totalCents = Math.round(amount * 100);
  const splitCents = splits.reduce((sum, s) => sum + Math.round(s.amount * 100), 0);
  return totalCents === splitCents;
}
