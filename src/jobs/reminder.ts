import { localParts, zonedTime } from "../time.js";

const REMINDER_HOUR = 9;
const MIN_MARGIN_MS = 2 * 3600_000;

/**
 * Cuándo enviar el recordatorio de "último día": a las 09:00 (hora local) del día de cierre.
 * Si el cierre es antes de las 11:00, ese aviso llegaría casi encima, así que se adelanta 24 h.
 */
export function reminderTime(deadlineMs: number, tz: string): number {
  const p = localParts(new Date(deadlineMs), tz);
  const morning = zonedTime(p.year, p.month, p.day, REMINDER_HOUR, 0, tz).getTime();
  return deadlineMs - morning < MIN_MARGIN_MS ? deadlineMs - 24 * 3600_000 : morning;
}
