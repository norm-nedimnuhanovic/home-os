// Fixed, never cuid()-generated — so resetSeedHousehold() (reset.ts) can
// find and delete last run's rows before recreating them (docs/seeding.md §3).
export const SEED_HOUSEHOLD_ID = "seed-household-rivera";
export const SEED_MEMBER_OWNER_ID = "seed-member-sam";
export const SEED_MEMBER_ADMIN_ID = "seed-member-priya";
export const SEED_MEMBER_MEMBER_ID = "seed-member-jordan";
export const SEED_DEV_PASSWORD = "devpassword123"; // local dev only — see household.ts's ALLOW_DEV_SEED_AUTH_USERS guard
