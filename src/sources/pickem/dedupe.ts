import type { DeadlineConfidence, Pickem } from "../../db/repos/pickems.js";
import type { PickemCandidate } from "./newsProvider.js";

/** Dos fechas límite a menos de esto se consideran el mismo pick'em (fuentes con horas distintas). */
export const SAME_DEADLINE_MS = 36 * 3600_000;

const RANK: Record<DeadlineConfidence, number> = { ninguna: 0, baja: 1, alta: 2 };

export type MergeDecision =
  | { type: "new" }
  | { type: "skip"; target: Pickem }
  /** El candidato aporta una fecha mejor: actualizar el existente y editar sus mensajes. */
  | { type: "upgrade"; target: Pickem };

/** Decide qué hacer con un candidato frente a los pick'em activos (de cualquier juego). */
export function decideMerge(c: PickemCandidate, active: Pickem[]): MergeDecision {
  const sameGame = active.filter((p) => p.game_key === c.gameKey);

  if (c.deadlineAt === null) {
    // Sin fecha solo aporta algo si no sabemos nada de este juego
    return sameGame[0] ? { type: "skip", target: sameGame[0] } : { type: "new" };
  }

  const sameDeadline = sameGame.find(
    (p) => p.deadline_at !== null && Math.abs(p.deadline_at - c.deadlineAt!) <= SAME_DEADLINE_MS,
  );
  if (sameDeadline) {
    return RANK[c.confidence] > RANK[sameDeadline.deadline_confidence]
      ? { type: "upgrade", target: sameDeadline }
      : { type: "skip", target: sameDeadline };
  }

  // Un pick'em del mismo juego que se publicó sin fecha: este candidato le pone fecha
  const undated = sameGame.find((p) => p.deadline_at === null);
  if (undated) return { type: "upgrade", target: undated };

  return { type: "new" };
}

/** Entre varios candidatos del mismo pick'em, el de fecha más fiable primero. */
export function sortCandidates(list: PickemCandidate[]): PickemCandidate[] {
  return [...list].sort(
    (a, b) =>
      RANK[b.confidence] - RANK[a.confidence] ||
      (a.deadlineAt ?? Infinity) - (b.deadlineAt ?? Infinity) ||
      b.publishedAt - a.publishedAt,
  );
}
