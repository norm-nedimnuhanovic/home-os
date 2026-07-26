import { Prisma } from "@prisma/client";

// Prisma's Decimal (decimal.js) instances aren't in the RSC-serializable
// value set — "Only plain objects can be passed to Client Components from
// Server Components. Decimal objects are not supported" — the moment any
// query result carrying a Decimal field (Transaction.amount,
// TransactionSplit.shareAmount/sharePercent, Settlement.amount,
// Budget.amount, Subscription.amount, and anything money-shaped a future
// module adds) reaches a "use client" component, or is returned from a
// Server Action back to its caller. Converting once here, for every model,
// is cheaper than remembering a per-query `Number(row.amount)` mapper at
// every call site — and a call site that forgets one is a silent runtime
// crash, not a type error, since Decimal and number are both just
// `Prisma.Decimal | number` at the TS level until this runs.
export function convertDecimals(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Prisma.Decimal.isDecimal(value)) return (value as Prisma.Decimal).toNumber();
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = convertDecimals(value[i]);
    return value;
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    (value as Record<string, unknown>)[key] = convertDecimals((value as Record<string, unknown>)[key]);
  }
  return value;
}

export const decimalSerializeExtension = Prisma.defineExtension({
  name: "decimal-serialize",
  query: {
    $allModels: {
      async $allOperations({ query, args }) {
        return convertDecimals(await query(args));
      },
    },
  },
});
