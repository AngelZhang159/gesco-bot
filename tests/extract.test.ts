import { describe, expect, it } from "vitest";
import { extractDeadline, isPickemTitle, mentionsOtherYear } from "../src/sources/pickem/extract.js";

const tz = "Europe/Madrid";
const reference = new Date("2026-10-28T10:00:00Z");
const now = new Date("2026-10-28T12:00:00Z");

describe("extractDeadline", () => {
  it("fecha y hora explícitas en UTC (confianza alta)", () => {
    const r = extractDeadline("Knockout picks open October 31 and lock November 3 at 22:05 UTC.", { reference, now, tz });
    expect(r.confidence).toBe("alta");
    expect(new Date(r.deadlineAt!).toISOString()).toBe("2026-11-03T22:05:00.000Z");
  });

  it("solo día en español: 23:59 hora de Madrid (confianza baja)", () => {
    const r = extractDeadline("Puedes hacer tus predicciones hasta el 3 de noviembre.", { reference, now, tz });
    expect(r.confidence).toBe("baja");
    // 3 nov 23:59 CET (UTC+1) = 22:59 UTC
    expect(new Date(r.deadlineAt!).toISOString()).toBe("2026-11-03T22:59:00.000Z");
  });

  it("ignora fechas pasadas y elige la próxima fecha de cierre", () => {
    const text =
      "Swiss picks locked on October 23. The Knockouts Pick'em closes on November 3, 2026 at 10:00 PM UTC. The final is on November 14.";
    const r = extractDeadline(text, { reference, now, tz });
    expect(new Date(r.deadlineAt!).toISOString()).toBe("2026-11-03T22:00:00.000Z");
  });

  it("ignora frases de apertura sin cierre", () => {
    const r = extractDeadline("Pick'em opens on November 1 for all players.", { reference, now, tz });
    expect(r).toEqual({ deadlineAt: null, confidence: "ninguna", closed: false });
  });

  it("sin fecha: ninguna", () => {
    const r = extractDeadline("Make your picks before the stage begins and earn rewards!", { reference, now, tz });
    expect(r).toEqual({ deadlineAt: null, confidence: "ninguna", closed: false });
  });

  it("ignora fechas a más de 60 días", () => {
    const r = extractDeadline("Predictions close on March 20, 2027.", { reference, now, tz });
    expect(r.deadlineAt).toBeNull();
  });

  it("fecha seguida de 'is the deadline'", () => {
    const r = extractDeadline("Remember: November 3 at 18:00 UTC is the deadline.", { reference, now, tz });
    expect(new Date(r.deadlineAt!).toISOString()).toBe("2026-11-03T18:00:00.000Z");
  });

  describe("artículo real de Worlds (estructura de egamersworld)", () => {
    const article = [
      "Lock in your Worlds 2026 Swiss Stage Pick'Ems before October 23.",
      "Riot Games opened the Swiss Stage bracket selection on October 18, giving fans until October 23 at 10:00 a.m. PT to lock in their selections before the first best-of-one series begins on stage.",
      "Swiss Stage: Opened October 18 and closes October 23 at 10:00 a.m.",
      "Knockout Stage: Opens October 31 and closes November 3 at 2:00 p.m.",
      "Securing points during the Swiss rounds between October 23 and October 31 is mandatory to stay within the top 5% threshold before the November 14 finals wrap up.",
    ].join("\n");
    const published = new Date("2026-10-21T15:37:21Z");

    it("el día de publicación: cierre de Swiss a las 10:00 PT", () => {
      const r = extractDeadline(article, { reference: published, now: new Date("2026-10-21T16:00:00Z"), tz });
      expect(r).toMatchObject({ confidence: "alta", closed: false });
      expect(new Date(r.deadlineAt!).toISOString()).toBe("2026-10-23T17:00:00.000Z");
    });

    it("pasado el Swiss: cierre de Knockouts (hora en PT por contexto), no la fecha de apertura", () => {
      const r = extractDeadline(article, { reference: published, now: new Date("2026-10-25T12:00:00Z"), tz });
      expect(new Date(r.deadlineAt!).toISOString()).toBe("2026-11-03T22:00:00.000Z");
    });
  });

  it("si solo hay cierres pasados, lo marca como cerrado", () => {
    const r = extractDeadline("Swiss picks lock October 23 at 10:00 a.m. PT.", { reference, now, tz });
    expect(r).toEqual({ deadlineAt: null, confidence: "ninguna", closed: true });
  });
});

describe("filtros de título", () => {
  it("reconoce pick'em en varias grafías", () => {
    expect(isPickemTitle("Worlds 2026 Pick'Em Guide: Swiss Stage")).toBe(true);
    expect(isPickemTitle("LoL Worlds pickem rewards")).toBe(true);
    expect(isPickemTitle("Marvel Rivals Ignite: Predictions and Rewards")).toBe(true);
    expect(isPickemTitle("Worlds 2026 Swiss Stage Round 1 Matchups Revealed")).toBe(false);
    expect(isPickemTitle("Our expert predictions for the final")).toBe(false);
  });

  it("descarta artículos de otros años", () => {
    const at = new Date("2026-10-25T00:00:00Z");
    expect(mentionsOtherYear("LoL Worlds 2024 Pick'Em: Everything you need to know", at)).toBe(true);
    expect(mentionsOtherYear("Worlds 2026 Pick'Em Guide", at)).toBe(false);
    expect(mentionsOtherYear("Marvel Rivals pick'em guide", at)).toBe(false);
  });
});
