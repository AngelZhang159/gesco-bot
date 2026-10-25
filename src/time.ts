export interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

export function localParts(date: Date, tz: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { year: +p.year!, month: +p.month!, day: +p.day!, hour: +p.hour!, minute: +p.minute! };
}

/** Minutos que la zona horaria va por delante de UTC en ese instante (Madrid: 60 o 120). */
export function tzOffsetMinutes(date: Date, tz: string): number {
  const p = localParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((asUtc - Math.floor(date.getTime() / 60_000) * 60_000) / 60_000);
}

/** Instante UTC correspondiente a una hora "de reloj" en la zona horaria dada. */
export function zonedTime(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = tzOffsetMinutes(guess, tz);
  const result = new Date(guess.getTime() - offset * 60_000);
  // Corrige si el cambio de horario cae entre la estimación y el resultado
  const offset2 = tzOffsetMinutes(result, tz);
  return offset2 === offset ? result : new Date(guess.getTime() - offset2 * 60_000);
}

export type TimestampStyle = "t" | "T" | "d" | "D" | "f" | "F" | "R";

/** Marca de tiempo de Discord: cada usuario la ve en su zona horaria. */
export function discordTs(ms: number | string | Date, style: TimestampStyle = "f"): string {
  const t = typeof ms === "number" ? ms : new Date(ms).getTime();
  return `<t:${Math.floor(t / 1000)}:${style}>`;
}
