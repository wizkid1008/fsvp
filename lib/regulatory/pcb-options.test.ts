import { describe, expect, it } from "vitest";
import { optionCode, optionName, shapeOption } from "./pcb-options";

/**
 * Real rows, copied from a live /industrysubclass/02 and /industrypic/02
 * response. Fixtures invented from the docs are what let the id/code confusion
 * through in the first place — FDA's spec never names these columns.
 */
const FABRIC = { INDID: "02", SUBCLASSID: "7", SUBCLASSCODE: "A", SUBCLASSDESC: "Fabric" };
const METAL = { INDID: "02", SUBCLASSID: "40", SUBCLASSCODE: "E", SUBCLASSDESC: "Metal" };
const NEC = {
  INDID: "02", SUBCLASSID: "81", SUBCLASSCODE: "Y",
  SUBCLASSDESC: "Not Elsewhere Classified (NEC)",
};
const COMMERCIALLY_STERILE = {
  INDID: "02", PICID: "16", PICCODE: "E", PICDESC: "Commercially Sterile",
};

describe("optionCode", () => {
  it("takes the CODE column, not a one-character ID that looks like one", () => {
    // The bug this exists for. Fabric's SUBCLASSID is "7" and its
    // SUBCLASSCODE is "A"; picking the first single-character cell returned 7,
    // which would have gone onto an entry line as a wrong product code.
    expect(optionCode(FABRIC, "subclass")).toBe("A");
  });

  it("gets the rows that were already right for the right reason now", () => {
    // These came out correct before only because their ids were two digits.
    expect(optionCode(METAL, "subclass")).toBe("E");
    expect(optionCode(NEC, "subclass")).toBe("Y");
    expect(optionCode(COMMERCIALLY_STERILE, "pic")).toBe("E");
  });

  it("never falls back to an id column when there is no CODE column", () => {
    // A one-digit id is indistinguishable from a code by shape, so an id is
    // excluded by name rather than trusted to look different.
    expect(optionCode({ SUBCLASSID: "7", SUBCLASSDESC: "Fabric" }, "subclass")).toBeNull();
  });

  it("still reads a table that names its column something else entirely", () => {
    expect(optionCode({ SUBCL: "B", SUBCLASSDESC: "Ceramic" }, "subclass")).toBe("B");
  });

  it("uppercases and trims what FDA sends", () => {
    expect(optionCode({ PICCODE: " e " }, "pic")).toBe("E");
  });

  it("returns null rather than inventing a code from a long value", () => {
    expect(optionCode({ SUBCLASSDESC: "Ceramic/Earthenware" }, "subclass")).toBeNull();
  });
});

describe("optionName", () => {
  it("reads FDA's abbreviated description column", () => {
    expect(optionName(FABRIC, "A")).toBe("Fabric");
    expect(optionName(COMMERCIALLY_STERILE, "E")).toBe("Commercially Sterile");
  });

  it("keeps punctuation and parentheses in a real FDA name", () => {
    expect(optionName(NEC, "Y")).toBe("Not Elsewhere Classified (NEC)");
  });

  it("returns null rather than naming a code after itself", () => {
    // Otherwise the dropdown reads "G - G", which names nothing.
    expect(optionName({ SUBCLASSCODE: "G" }, "G")).toBeNull();
  });
});

describe("shapeOption", () => {
  it("pairs the code with its name", () => {
    expect(shapeOption(METAL, "subclass")).toMatchObject({ code: "E", name: "Metal" });
  });

  it("drops a row with no usable code rather than guessing one", () => {
    expect(shapeOption({ INDID: "02" }, "subclass")).toBeNull();
  });
});
