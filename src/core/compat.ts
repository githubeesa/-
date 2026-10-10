// Red-cell compatibility (ABO + RhD). Used to answer the donor's question
// "which open requests can MY blood actually help?" as an Arkiv OR-query.
//
// Scope note: this table is for red cells / whole blood. Plasma and platelet
// compatibility differ; the app shows component on every request and the
// blood centre always cross-matches before transfusion. Rakt Relay never makes
// a clinical decision, it only routes donors to a verified blood centre.

export const BLOOD_GROUPS = ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"] as const
export type BloodGroup = (typeof BLOOD_GROUPS)[number]

export const COMPONENTS = ["whole", "prbc", "platelets", "plasma"] as const
export type Component = (typeof COMPONENTS)[number]

const DONOR_CAN_GIVE_TO: Record<BloodGroup, BloodGroup[]> = {
  "O-": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
  "O+": ["O+", "A+", "B+", "AB+"],
  "A-": ["A-", "A+", "AB-", "AB+"],
  "A+": ["A+", "AB+"],
  "B-": ["B-", "B+", "AB-", "AB+"],
  "B+": ["B+", "AB+"],
  "AB-": ["AB-", "AB+"],
  "AB+": ["AB+"],
}

export function isBloodGroup(v: string): v is BloodGroup {
  return (BLOOD_GROUPS as readonly string[]).includes(v)
}

/** Recipient groups a donor of `donor` can give red cells to. */
export function recipientsFor(donor: BloodGroup): BloodGroup[] {
  return DONOR_CAN_GIVE_TO[donor]
}

/** Donor groups that can serve a recipient of `recipient`. */
export function donorsFor(recipient: BloodGroup): BloodGroup[] {
  return BLOOD_GROUPS.filter((d) => DONOR_CAN_GIVE_TO[d].includes(recipient))
}

/** Whole-blood donation interval used in India (NBTC 2017 donor criteria): 90 days male, 120 days female.
 *  We use the conservative 90-day floor only to show "you may be eligible again from"; the blood
 *  centre's own screening is authoritative. */
export const MIN_DONATION_INTERVAL_DAYS = 90
