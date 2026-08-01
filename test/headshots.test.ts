import { afterEach, describe, expect, it } from "vitest";
import { headshotFor } from "../src/io/headshots.ts";

const g = globalThis as { window?: { HNIB_HEADSHOTS?: Record<string, string> } };

afterEach(() => {
  delete g.window;
});

describe("headshotFor", () => {
  it("returns undefined when there is no window (SSR/tests)", () => {
    expect(headshotFor("abc")).toBeUndefined();
  });

  it("returns undefined when the manifest is absent", () => {
    g.window = {};
    expect(headshotFor("abc")).toBeUndefined();
  });

  it("looks up the player id in window.HNIB_HEADSHOTS", () => {
    g.window = { HNIB_HEADSHOTS: { abc: "./headshots/abc.jpg" } };
    expect(headshotFor("abc")).toBe("./headshots/abc.jpg");
    expect(headshotFor("nope")).toBeUndefined();
  });
});
