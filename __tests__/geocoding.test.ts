import { describe, it, expect } from "vitest";
import { parseNominatimAddress } from "@/lib/geocoding";

describe("parseNominatimAddress", () => {
  it("prefers the road name for the street", () => {
    const r = parseNominatimAddress({ road: "طريق الملك فهد", suburb: "النرجس" });
    expect(r.street).toBe("طريق الملك فهد");
    expect(r.district).toBe("النرجس");
  });

  it("falls back through pedestrian/residential/neighbourhood when road is missing", () => {
    expect(parseNominatimAddress({ residential: "حي الياسمين" }).street).toBe("حي الياسمين");
    expect(parseNominatimAddress({ neighbourhood: "الملقا" }).street).toBe("الملقا");
  });

  it("uses richer district fallbacks (suburb → neighbourhood → city)", () => {
    expect(parseNominatimAddress({ road: "ش 15", neighbourhood: "الصحافة" }).district).toBe("الصحافة");
    expect(parseNominatimAddress({ road: "ش 15", city: "الرياض" }).district).toBe("الرياض");
  });

  it("returns 'غير معروف' when nothing usable is present", () => {
    expect(parseNominatimAddress({})).toEqual({ street: "غير معروف", district: "غير معروف" });
  });
});
