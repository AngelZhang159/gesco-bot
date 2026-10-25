import * as chrono from "chrono-node";
import type { DeadlineConfidence } from "../../db/repos/pickems.js";
import { tzOffsetMinutes, zonedTime } from "../../time.js";

export interface DeadlineResult {
  deadlineAt: number | null;
  confidence: DeadlineConfidence;
  /** Solo se encontraron fechas de cierre ya pasadas: el pick'em ha cerrado. */
  closed: boolean;
}

const MAX_AHEAD_MS = 60 * 24 * 3600_000;
/** La fecha tiene que estar como mucho a estos caracteres de la palabra de cierre. */
const MAX_DISTANCE = 45;

/** Palabras que acompañan a la fecha de cierre de un pick'em (en/es). */
const CLOSING_WORDS =
  /\b(lock(s|ed|ing)?|deadline|cut-?off|clos(e|es|ed|ing)|until|before|ends?|ending|due|cierra(n)?|cierre|hasta|antes de(l)?|finaliza(n)?|termina(n)?|plazo|bloquea(n)?|fecha l[ií]mite)\b/i;
/** Palabras que indican que la fecha es de apertura y no de cierre. */
const OPENING_WORDS = /\b(open(s|ed)?|go(es)? live|launch(es)?|available from|start(s|ed)?|abre(n)?|desde|empieza(n)?|comienza(n)?)\b/i;
/** "November 3 is the deadline", "3 de noviembre es la fecha límite" */
const CLOSING_AFTER = /^\W{0,3}(is|es|ser[áa]|will be|as)?\s*(the|la|el)?\s*(deadline|cut-?off|plazo|cierre|fecha l[ií]mite)\b/i;

/** Zonas horarias que suelen usar los anuncios de esports (sin "CT": en CS2 es "Counter-Terrorist"). */
const TZ_ABBR: Record<string, string> = {
  PT: "America/Los_Angeles",
  PST: "America/Los_Angeles",
  PDT: "America/Los_Angeles",
  ET: "America/New_York",
  EST: "America/New_York",
  EDT: "America/New_York",
  CET: "Europe/Paris",
  CEST: "Europe/Paris",
  UTC: "UTC",
  GMT: "UTC",
  BST: "Europe/London",
  KST: "Asia/Seoul",
};

export const PICKEM_KEYWORDS = /pick['’`]?\s?em|pickem/i;
const PREDICTION_WORDS = /\b(predictions?|predicciones|bracket challenge)\b/i;
const REWARD_WORDS = /\b(rewards?|recompensas?|free|gratis|units|premios?)\b/i;

/** ¿El título habla de un pick'em (o de unas predicciones con recompensas)? */
export function isPickemTitle(title: string): boolean {
  return PICKEM_KEYWORDS.test(title) || (PREDICTION_WORDS.test(title) && REWARD_WORDS.test(title));
}

/** Descarta artículos de otros años ("Worlds 2024 Pick'em" en 2026). */
export function mentionsOtherYear(title: string, at: Date): boolean {
  const years = [...title.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]));
  const y = at.getUTCFullYear();
  return years.length > 0 && !years.some((v) => v === y || v === y + 1);
}

/** Separa frases sin cortar en "10:00 a.m. PT". */
export function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])(?<![ap]\.m\.)\s+(?=[A-ZÁÉÍÓÚÑ¡¿])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
}

/** Zona horaria que más se repite en el texto (p. ej. Riot usa "PT"), para horas que no la indican. */
export function dominantTimezone(text: string): string | null {
  const counts = new Map<string, number>();
  for (const m of text.matchAll(/\b(PT|PST|PDT|ET|EST|EDT|CET|CEST|UTC|GMT|BST|KST)\b/g)) {
    const zone = TZ_ABBR[m[1]!]!;
    counts.set(zone, (counts.get(zone) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function lastIndexOf(re: RegExp, text: string): number {
  let last = -1;
  for (const m of text.matchAll(new RegExp(re.source, "gi"))) last = m.index;
  return last;
}

/** La fecha va justo después de una palabra de cierre (y no de apertura), o justo antes de "deadline". */
function isClosingDate(sentence: string, index: number, length: number): boolean {
  const before = sentence.slice(Math.max(0, index - MAX_DISTANCE), index);
  const closing = lastIndexOf(CLOSING_WORDS, before);
  if (closing >= 0 && closing > lastIndexOf(OPENING_WORDS, before)) return true;
  return CLOSING_AFTER.test(sentence.slice(index + length, index + length + 40));
}

/**
 * Busca la fecha límite en el texto: solo fechas pegadas a palabras de cierre, futuras y a menos de
 * 60 días; se queda con la más cercana. Sin hora explícita se asume 23:59 en `tz` (confianza baja).
 */
export function extractDeadline(text: string, opts: { reference: Date; now: Date; tz: string }): DeadlineResult {
  const { reference, now, tz } = opts;
  const articleTz = dominantTimezone(text) ?? tz;
  const refTz = tzOffsetMinutes(reference, articleTz);
  let best: { at: number; certain: boolean } | null = null;
  let pastFound = false;

  for (const sentence of splitSentences(text)) {
    if (!CLOSING_WORDS.test(sentence)) continue;
    const results = [
      ...chrono.en.parse(sentence, { instant: reference, timezone: refTz }),
      ...chrono.es.parse(sentence, { instant: reference, timezone: refTz }),
    ];

    for (const r of results) {
      if (!isClosingDate(sentence, r.index, r.text.length)) continue;
      const comp = r.end ?? r.start; // en un rango, el cierre es el final
      if (!comp.isCertain("day")) continue;
      const certainTime = comp.isCertain("hour");
      const [y, m, d] = [comp.get("year")!, comp.get("month")!, comp.get("day")!];
      let date: Date;
      if (!certainTime) date = zonedTime(y, m, d, 23, 59, tz);
      // Hora sin zona: hora de reloj en la zona del artículo ese día (respeta cambios de horario)
      else if (!comp.isCertain("timezoneOffset")) date = zonedTime(y, m, d, comp.get("hour")!, comp.get("minute") ?? 0, articleTz);
      else date = comp.date();
      const t = date.getTime();
      if (t <= now.getTime()) {
        pastFound = true;
        continue;
      }
      if (t > reference.getTime() + MAX_AHEAD_MS) continue;
      if (!best || t < best.at || (t === best.at && certainTime)) best = { at: t, certain: certainTime };
    }
  }

  if (!best) return { deadlineAt: null, confidence: "ninguna", closed: pastFound };
  return { deadlineAt: best.at, confidence: best.certain ? "alta" : "baja", closed: false };
}
