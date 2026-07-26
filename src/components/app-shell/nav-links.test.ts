import { describe, expect, it } from "vitest";
import { isNavItemActive } from "./nav-links";

describe("isNavItemActive", () => {
  it("matches an exact single-segment route", () => {
    expect(isNavItemActive("/tasks", "/tasks")).toBe(true);
  });

  it("matches a nested route under the same top-level segment", () => {
    expect(isNavItemActive("/kanban/board_123", "/kanban")).toBe(true);
  });

  it("does not match an unrelated top-level route", () => {
    expect(isNavItemActive("/tasks", "/kanban")).toBe(false);
  });

  it("matches any settings sub-page even though the nav target is a specific sub-path", () => {
    expect(isNavItemActive("/settings/notifications", "/settings/members")).toBe(true);
    expect(isNavItemActive("/settings/modules", "/settings/members")).toBe(true);
  });

  it("does not match the root path against any real target", () => {
    expect(isNavItemActive("/", "/dashboard")).toBe(false);
  });
});
