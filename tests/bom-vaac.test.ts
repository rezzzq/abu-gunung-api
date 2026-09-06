import { describe, expect, it } from "vitest";
import { graphicNameFor, newestPerProduct, parseListing } from "../src/lib/bom-vaac";

const listing = `IDY41290.202609060140.txt
IDY41290.202609060733.txt
IDY65290.202609060733.png
IDY41290.202609061344.txt
IDY65290.202609061344.png
IDY41305.202609061125.txt
IDY65305.202609061125.png
IDY41305.202609060926.txt
README.txt
`;

describe("BoM VAAC archive listing", () => {
  it("keeps only advisory text files", () => {
    expect(parseListing(listing)).toHaveLength(5);
    expect(parseListing(listing)[0]).toEqual({ product: "IDY41290", stamp: "202609060140", name: "IDY41290.202609060140.txt" });
  });

  it("picks the newest text file per product slot", () => {
    const newest = newestPerProduct(parseListing(listing));
    expect([...newest.keys()].sort()).toEqual(["IDY41290", "IDY41305"]);
    expect(newest.get("IDY41290")?.name).toBe("IDY41290.202609061344.txt");
    expect(newest.get("IDY41305")?.stamp).toBe("202609061125");
  });

  it("derives the graphic file name from the text file name", () => {
    expect(graphicNameFor("IDY41305.202609061125.txt")).toBe("IDY65305.202609061125.png");
    expect(graphicNameFor("README.txt")).toBeNull();
  });
});
