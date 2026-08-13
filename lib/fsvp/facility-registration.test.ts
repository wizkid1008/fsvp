import { describe, expect, it } from "vitest";
import {
  nextRenewalWindow,
  registrationBlock,
  registrationState,
  type RegistrationInput,
} from "./facility-registration";

const on = (iso: string) => new Date(`${iso}T12:00:00Z`);

function facility(over: Partial<RegistrationInput> = {}): RegistrationInput {
  return { fdaRegistrationNumber: "12345678901", registrationExpiresOn: "2026-12-31", ...over };
}

describe("nextRenewalWindow", () => {
  it("uses this year's window when inside an even year", () => {
    // 21 CFR 1.230 — 1 October to 31 December, even years only.
    expect(nextRenewalWindow(on("2026-08-13"))).toEqual({
      year: 2026, opens: "2026-10-01", closes: "2026-12-31",
    });
  });

  it("still uses this year's window while the window is open", () => {
    expect(nextRenewalWindow(on("2026-11-15")).year).toBe(2026);
    expect(nextRenewalWindow(on("2026-12-31")).year).toBe(2026);
  });

  it("skips to the next even year from an odd year", () => {
    expect(nextRenewalWindow(on("2027-03-01")).year).toBe(2028);
    expect(nextRenewalWindow(on("2027-11-15")).year).toBe(2028);
  });

  it("rolls to the year after next once an even year's window has closed", () => {
    // 1 January 2027 is odd, so the answer is 2028 either way — the case that
    // matters is that an even year never points at itself after December.
    expect(nextRenewalWindow(on("2028-01-02")).year).toBe(2028);
    expect(nextRenewalWindow(on("2029-01-02")).year).toBe(2030);
  });
});

describe("registrationState", () => {
  it("reports a facility with no number as unregistered", () => {
    expect(registrationState(facility({ fdaRegistrationNumber: null }), on("2026-08-13")))
      .toBe("unregistered");
    expect(registrationState(facility({ fdaRegistrationNumber: "   " }), on("2026-08-13")))
      .toBe("unregistered");
  });

  it("does not treat a number with no renewal date as current", () => {
    // The important distinction. A number proves the facility registered once,
    // not that it is registered now. Calling that "current" is how a lapse goes
    // unnoticed for two years.
    expect(registrationState(facility({ registrationExpiresOn: null }), on("2026-08-13")))
      .toBe("unknown_expiry");
  });

  it("is current before the window opens", () => {
    expect(registrationState(facility({ registrationExpiresOn: "2026-12-31" }), on("2026-08-13")))
      .toBe("current");
  });

  it("flags renewal once the window opens", () => {
    expect(registrationState(facility({ registrationExpiresOn: "2026-12-31" }), on("2026-10-01")))
      .toBe("renewal_open");
    expect(registrationState(facility({ registrationExpiresOn: "2026-12-31" }), on("2026-12-30")))
      .toBe("renewal_open");
  });

  it("expires the day after the window closes", () => {
    expect(registrationState(facility({ registrationExpiresOn: "2026-12-31" }), on("2026-12-31")))
      .toBe("renewal_open");
    expect(registrationState(facility({ registrationExpiresOn: "2026-12-31" }), on("2027-01-01")))
      .toBe("expired");
  });

  it("is current again once renewed into the following cycle", () => {
    // Renewed in the 2026 window, so valid through the 2028 window.
    expect(registrationState(facility({ registrationExpiresOn: "2028-12-31" }), on("2027-06-01")))
      .toBe("current");
    expect(registrationState(facility({ registrationExpiresOn: "2028-12-31" }), on("2028-10-02")))
      .toBe("renewal_open");
  });
});

describe("registrationBlock", () => {
  it("blocks import for unregistered and expired facilities, citing the rule", () => {
    expect(registrationBlock("unregistered")).toContain("1.225");
    expect(registrationBlock("expired")).toContain("1.230");
  });

  it("does not block while the renewal window is merely open", () => {
    // Still valid until 31 December. Blocking here would stop lawful shipments.
    expect(registrationBlock("renewal_open")).toBeNull();
    expect(registrationBlock("current")).toBeNull();
  });

  it("asks for the date rather than blocking when only the date is missing", () => {
    const message = registrationBlock("unknown_expiry");
    expect(message).toBeTruthy();
    expect(message).toContain("Confirm when it was last renewed");
  });
});
