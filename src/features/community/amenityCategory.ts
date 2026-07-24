/** Heuristic amenity categories for mockup filters (no DB category column). */
export type AmenityCategoryFilter = "all" | "indoor" | "outdoor" | "others";

const INDOOR = [
  "clubhouse",
  "gym",
  "indoor",
  "hall",
  "theatre",
  "theater",
  "cinema",
  "badminton",
  "squash",
  "table tennis",
  "billiard",
  "library",
  "party",
  "multipurpose",
  "yoga",
  "spa",
  "sauna",
];

const OUTDOOR = [
  "pool",
  "swim",
  "tennis",
  "cricket",
  "garden",
  "park",
  "playground",
  "basketball",
  "outdoor",
  "jogging",
  "lawn",
  "court",
  "football",
  "kids play",
];

export function amenityCategory(
  name: string,
  description?: string | null,
): Exclude<AmenityCategoryFilter, "all"> {
  const hay = `${name} ${description ?? ""}`.toLowerCase();
  if (INDOOR.some((k) => hay.includes(k))) return "indoor";
  if (OUTDOOR.some((k) => hay.includes(k))) return "outdoor";
  return "others";
}

export function matchesAmenityCategory(
  name: string,
  description: string | null | undefined,
  filter: AmenityCategoryFilter,
): boolean {
  if (filter === "all") return true;
  return amenityCategory(name, description) === filter;
}
