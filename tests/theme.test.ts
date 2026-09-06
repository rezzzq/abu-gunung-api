import { describe, expect, it } from "vitest";
import { resolveTheme } from "../src/lib/theme";

describe("resolveTheme", () => {
  it("uses a stored choice over the system preference", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("follows the system preference when nothing valid is stored", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
    expect(resolveTheme("purple", true)).toBe("dark");
    expect(resolveTheme(42, false)).toBe("light");
  });
});
