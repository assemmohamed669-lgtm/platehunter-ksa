import { describe, it, expect } from "vitest";
import { extractVehicleType } from "@/lib/plateParser";

describe("extractVehicleType", () => {
  it("pulls the type spoken after the plate and returns the rest", () => {
    expect(extractVehicleType("ادن 6121 ونيت")).toEqual({ vehicleType: "ونيت", rest: "ادن 6121" });
  });

  it("detects the common field types", () => {
    expect(extractVehicleType("ابح 1234 مصدومة").vehicleType).toBe("مصدومة");
    expect(extractVehicleType("قنص 5678 فان").vehicleType).toBe("فان");
    expect(extractVehicleType("دحر 9999 دباب").vehicleType).toBe("دباب");
    expect(extractVehicleType("ابل 2150 مركونة").vehicleType).toBe("مركونة");
  });

  it("returns rest unchanged and no type when none present", () => {
    expect(extractVehicleType("ادن 6121")).toEqual({ rest: "ادن 6121" });
  });

  it("collapses the gap left where the type word was removed", () => {
    expect(extractVehicleType("ادن 6121 ونيت").rest).toBe("ادن 6121");
  });
});
