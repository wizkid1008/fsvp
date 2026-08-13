/**
 * FDA food facility registration, and when it lapses.
 *
 * 21 CFR 1.230: a facility that manufactures, processes, packs or holds food
 * for consumption in the United States must register with FDA, and must renew
 * that registration **between 1 October and 31 December of every even-numbered
 * year**. A registration not renewed in that window expires, and § 1.225 makes
 * offering food for import from an unregistered facility a prohibited act — the
 * shipment is refused at entry.
 *
 * This matters to an FSVP importer even though the obligation is the facility's,
 * because the food arrives in the importer's name. The platform held
 * `fda_registration_number` as a bare string with no dates at all, so a
 * registration could lapse silently and the first anyone knew was a refusal.
 *
 * The window is fixed by regulation rather than by the individual registration,
 * which is what makes this computable: every facility in the country renews in
 * the same quarter. So a date is all that is needed to know where a facility
 * stands.
 */

/** Renewal opens 1 October and closes 31 December, even years only. */
export const RENEWAL_OPENS_MONTH = 10;
export const RENEWAL_CLOSES_MONTH = 12;

export type RegistrationWindow = {
  /** The even year whose window this is. */
  year: number;
  /** ISO date the window opens. */
  opens: string;
  /** ISO date the window closes — the effective expiry of the last renewal. */
  closes: string;
};

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function utcDate(on: Date): { year: number; month: number; day: number } {
  return { year: on.getUTCFullYear(), month: on.getUTCMonth() + 1, day: on.getUTCDate() };
}

/**
 * The renewal window a facility must act in next, given today.
 *
 * Inside an even year's window, that window is the current one — a facility
 * still has until 31 December. Once it closes, or in an odd year, the next one
 * is the following even year.
 */
export function nextRenewalWindow(on: Date = new Date()): RegistrationWindow {
  const { year, month } = utcDate(on);
  const isEven = year % 2 === 0;

  // Still inside this year's window.
  const year_ = isEven && month <= RENEWAL_CLOSES_MONTH ? year : year + (isEven ? 2 : 1);

  return {
    year: year_,
    opens: iso(year_, RENEWAL_OPENS_MONTH, 1),
    closes: iso(year_, RENEWAL_CLOSES_MONTH, 31),
  };
}

export type RegistrationState =
  | "unregistered"      // no number recorded
  | "unknown_expiry"    // number recorded, no renewal date — cannot be relied on
  | "current"           // renewed, and the next window has not opened
  | "renewal_open"      // inside the window; renew now
  | "expired";          // window closed without renewal

export type RegistrationInput = {
  fdaRegistrationNumber: string | null;
  /** Last date the registration is valid — 31 December of its renewal year. */
  registrationExpiresOn: string | null;
};

/**
 * Where a facility stands today.
 *
 * `unknown_expiry` is deliberately distinct from `current`. A registration
 * number with no renewal date proves the facility registered once, not that it
 * is registered now — and treating "we have a number" as "we are compliant" is
 * exactly the assumption that lets a lapse go unnoticed for two years.
 */
export function registrationState(
  input: RegistrationInput,
  on: Date = new Date()
): RegistrationState {
  if (!input.fdaRegistrationNumber?.trim()) return "unregistered";
  if (!input.registrationExpiresOn) return "unknown_expiry";

  const today = iso(utcDate(on).year, utcDate(on).month, utcDate(on).day);
  if (input.registrationExpiresOn < today) return "expired";

  const window = nextRenewalWindow(on);
  // Comparing dates as ISO strings is safe: fixed width, zero padded.
  if (today >= window.opens && input.registrationExpiresOn <= window.closes) {
    return "renewal_open";
  }

  return "current";
}

export const REGISTRATION_LABEL: Record<RegistrationState, string> = {
  unregistered:   "Not registered",
  unknown_expiry: "Renewal date unknown",
  current:        "Registered",
  renewal_open:   "Renewal open",
  expired:        "Registration expired",
};

/** Why this state blocks import, or null when it does not. */
export function registrationBlock(state: RegistrationState): string | null {
  switch (state) {
    case "unregistered":
      return "This facility has no FDA registration number. Food from an unregistered facility may not be offered for import (21 CFR 1.225).";
    case "expired":
      return "This facility's FDA registration expired at the end of its renewal window. It must re-register before food from it can be offered for import (21 CFR 1.230).";
    case "unknown_expiry":
      return "A registration number is recorded but no renewal date, so the registration cannot be shown to be current. Confirm when it was last renewed.";
    case "renewal_open":
      return null; // Still valid until 31 December — a warning, not a block.
    case "current":
      return null;
  }
}
