import { describe, it, expect } from "vitest";
import { compareSemver } from "@/lib/updater";

describe("updater semver comparison", () => {
  it("correctly compares higher versions", () => {
    expect(compareSemver("0.16.9", "0.16.8")).toBe(1);
    expect(compareSemver("v0.17.0", "0.16.8")).toBe(1);
    expect(compareSemver("1.0.0", "0.16.8")).toBe(1);
    expect(compareSemver("0.16.8.1", "0.16.8")).toBe(1);
  });

  it("correctly compares lower versions", () => {
    expect(compareSemver("0.16.7", "0.16.8")).toBe(-1);
    expect(compareSemver("v0.15.3", "v0.16.8")).toBe(-1);
    expect(compareSemver("0.16.0", "0.16.8")).toBe(-1);
  });

  it("correctly identifies equal versions with or without v prefix", () => {
    expect(compareSemver("0.16.8", "0.16.8")).toBe(0);
    expect(compareSemver("v0.16.8", "0.16.8")).toBe(0);
    expect(compareSemver("0.16.8", "v0.16.8")).toBe(0);
    expect(compareSemver("v0.16.8-beta", "0.16.8")).toBe(0);
  });
});
