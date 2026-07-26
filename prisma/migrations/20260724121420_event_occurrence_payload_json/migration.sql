-- AlterTable
-- payloadSnapshot moves from a plain string to a native jsonb column, so
-- emitEvent() can pass its payload object directly instead of manually
-- (de)serializing it — see docs/module-architecture.md §4.1.
ALTER TABLE "EventOccurrence"
  ALTER COLUMN "payloadSnapshot" TYPE JSONB USING "payloadSnapshot"::JSONB;
