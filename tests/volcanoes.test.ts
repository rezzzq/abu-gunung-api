import { describe, expect, it } from "vitest";
import { byMagmaName, resolveVolcano } from "../src/lib/volcanoes";

describe("resolveVolcano", () => {
  it("maps a VAAC volcano field to the MAGMA code, display name and position", () => {
    const v = resolveVolcano("KRAKATAU 262000");
    expect(v).toMatchObject({ id: "KRA", name: "Anak Krakatau", magmaName: "Anak Krakatau", gvp: "262000", region: "Selat Sunda" });
    expect(v.lat).toBeCloseTo(-6.102, 2);
    expect(v.lon).toBeCloseTo(105.423, 2);
  });

  it("handles multi-word names and VAAC spellings that differ from MAGMA", () => {
    expect(resolveVolcano("LEWOTOBI LAKI-LAKI 264180").id).toBe("LWK");
    expect(resolveVolcano("LEWOTOLOK 264230")).toMatchObject({ id: "LEW", name: "Ili Lewotolok" });
  });

  it("falls back to a title-cased name without a position for unknown volcanoes", () => {
    const v = resolveVolcano("MOUNT NOWHERE 999999");
    expect(v).toMatchObject({ id: "MOUNT-NOWHERE", name: "Mount Nowhere", gvp: "999999", magmaName: null, lat: null, lon: null });
  });

  it("finds table entries by MAGMA name", () => {
    expect(byMagmaName("Merapi")?.id).toBe("MER");
    expect(byMagmaName("Gunung Fiktif")).toBeNull();
  });
});
