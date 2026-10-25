export const CATEGORIES = ["epic", "drops", "pickem"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  epic: "Juegos gratis de Epic",
  drops: "Twitch Drops",
  pickem: "Pick'em",
};

/** Normaliza un nombre de juego para compararlo ("Marvel Rivals" -> "marvel rivals"). */
export function gameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // quita tildes y diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
