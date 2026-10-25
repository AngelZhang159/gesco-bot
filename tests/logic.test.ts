import { describe, expect, it } from "vitest";
import { openDb } from "../src/db/index.js";
import { channelFor } from "../src/db/repos/guilds.js";
import { createRepos } from "../src/db/repos/index.js";
import type { Pickem } from "../src/db/repos/pickems.js";
import { reminderTime } from "../src/jobs/reminder.js";
import { dropsRecipients, mentionChunks, mentionedIds } from "../src/notifier/mentions.js";
import { decideMerge, sortCandidates } from "../src/sources/pickem/dedupe.js";
import type { PickemCandidate } from "../src/sources/pickem/newsProvider.js";
import { zonedTime } from "../src/time.js";

describe("menciones de drops", () => {
  const filters = [
    { user_id: "a", game_key: "rust", game_name: "Rust", mode: "allow" as const },
    { user_id: "b", game_key: "rust", game_name: "Rust", mode: "block" as const },
    { user_id: "d", game_key: "valorant", game_name: "Valorant", mode: "allow" as const },
  ];
  const subscribed = ["a", "b", "c", "d"];

  it("allow: solo por los juegos seguidos; block: nunca; sin filtros: todos", () => {
    expect(dropsRecipients(subscribed, filters, "rust")).toEqual(["a", "c"]);
    expect(dropsRecipients(subscribed, filters, "valorant")).toEqual(["b", "c", "d"]);
    expect(dropsRecipients(subscribed, filters, "fortnite")).toEqual(["b", "c"]);
  });

  it("los filtros de usuarios no suscritos no añaden menciones", () => {
    expect(dropsRecipients(["c"], filters, "rust")).toEqual(["c"]);
  });
});

describe("reparto de menciones", () => {
  it("sin usuarios devuelve solo la cabecera", () => {
    expect(mentionChunks("Hola", [])).toEqual(["Hola"]);
  });

  it("respeta el límite de caracteres", () => {
    const ids = Array.from({ length: 200 }, (_, i) => String(100000000000000000n + BigInt(i)));
    const chunks = mentionChunks("🎮 **Juegos gratis**", ids);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 2000)).toBe(true);
    expect(chunks.flatMap(mentionedIds)).toEqual(ids);
    expect(chunks[0]).toMatch(/^🎮 \*\*Juegos gratis\*\*\n<@/);
  });
});

describe("recordatorio de pick'em", () => {
  const tz = "Europe/Madrid";

  it("a las 09:00 hora local del día de cierre", () => {
    const deadline = zonedTime(2026, 11, 3, 23, 5, tz).getTime(); // 3 nov 23:05 Madrid (CET)
    expect(new Date(reminderTime(deadline, tz)).toISOString()).toBe("2026-11-03T08:00:00.000Z");
  });

  it("con horario de verano", () => {
    const deadline = zonedTime(2026, 7, 20, 18, 0, tz).getTime();
    expect(new Date(reminderTime(deadline, tz)).toISOString()).toBe("2026-07-20T07:00:00.000Z");
  });

  it("si cierra antes de las 11:00, 24 h antes", () => {
    const deadline = zonedTime(2026, 11, 3, 10, 0, tz).getTime();
    expect(reminderTime(deadline, tz)).toBe(deadline - 24 * 3600_000);
  });
});

describe("fusión de pick'em", () => {
  const base: Pickem = {
    id: 1,
    game_key: "lol",
    game_name: "League of Legends",
    title: "Worlds Pick'em",
    url: "https://a",
    deadline_at: Date.parse("2026-11-03T22:05:00Z"),
    deadline_confidence: "baja",
    published_at: 0,
    created_at: 0,
    updated_at: 0,
    discarded: 0,
  };
  const cand = (over: Partial<PickemCandidate>): PickemCandidate => ({
    gameKey: "lol",
    gameName: "League of Legends",
    title: "t",
    url: "https://b",
    publishedAt: 0,
    deadlineAt: Date.parse("2026-11-03T20:00:00Z"),
    confidence: "baja",
    closed: false,
    ...over,
  });

  it("misma fecha (±36 h) y misma confianza: se ignora", () => {
    expect(decideMerge(cand({}), [base]).type).toBe("skip");
  });

  it("misma fecha con más confianza: se actualiza", () => {
    expect(decideMerge(cand({ confidence: "alta" }), [base])).toEqual({ type: "upgrade", target: base });
  });

  it("otra fase (fecha lejana): pick'em nuevo", () => {
    expect(decideMerge(cand({ deadlineAt: Date.parse("2026-11-10T10:00:00Z") }), [base]).type).toBe("new");
  });

  it("otro juego: nuevo", () => {
    expect(decideMerge(cand({ gameKey: "valorant" }), [base]).type).toBe("new");
  });

  it("sin fecha: solo es nuevo si no hay nada de ese juego", () => {
    expect(decideMerge(cand({ deadlineAt: null, confidence: "ninguna" }), [base]).type).toBe("skip");
    expect(decideMerge(cand({ deadlineAt: null, confidence: "ninguna" }), []).type).toBe("new");
  });

  it("un candidato con fecha completa un pick'em publicado sin fecha", () => {
    const undated = { ...base, deadline_at: null, deadline_confidence: "ninguna" as const };
    expect(decideMerge(cand({}), [undated])).toEqual({ type: "upgrade", target: undated });
  });

  it("ordena primero los de fecha más fiable", () => {
    const list = sortCandidates([cand({ confidence: "ninguna", deadlineAt: null }), cand({ confidence: "alta" }), cand({})]);
    expect(list.map((c) => c.confidence)).toEqual(["alta", "baja", "ninguna"]);
  });
});

describe("repositorios", () => {
  it("configuración, suscripciones, publicaciones y pick'em activos", () => {
    const repos = createRepos(openDb(":memory:"));
    repos.guilds.setChannel("g1", null, "c-general");
    repos.guilds.setChannel("g1", "drops", "c-drops");
    const cfg = repos.guilds.get("g1")!;
    expect(channelFor(cfg, "epic")).toBe("c-general");
    expect(channelFor(cfg, "drops")).toBe("c-drops");
    repos.guilds.setEnabled("g1", "epic", false);
    expect(channelFor(repos.guilds.get("g1")!, "epic")).toBeNull();
    expect(repos.guilds.listConfigured().map((g) => g.guild_id)).toEqual(["g1"]);

    expect(repos.subs.subscribe("g1", "u1", "drops")).toBe(true);
    expect(repos.subs.subscribe("g1", "u1", "drops")).toBe(false);
    expect(repos.subs.usersFor("g1", "drops")).toEqual(["u1"]);

    repos.posts.record("g1", "epic", "batch", "c", "m");
    expect(repos.posts.has("g1", "epic", "batch")).toBe(true);
    expect(repos.posts.listForItem("epic", "batch")).toHaveLength(1);

    const now = Date.now();
    const p = repos.pickems.insert({
      game_key: "lol",
      game_name: "LoL",
      title: "t",
      url: "u",
      deadline_at: now + 3600_000,
      deadline_confidence: "alta",
      published_at: now,
    });
    expect(repos.pickems.listActive(now).map((x) => x.id)).toEqual([p.id]);
    expect(repos.pickems.listActive(now + 2 * 3600_000)).toEqual([]);
    repos.pickems.discard(p.id);
    expect(repos.pickems.listActive(now)).toEqual([]);

    repos.items.replaceAll("drops", [{ id: "a", data: { n: 1 } }]);
    repos.items.replaceAll("drops", [{ id: "b", data: { n: 2 } }]);
    expect(repos.items.list("drops")).toEqual([{ n: 2 }]);

    repos.guilds.remove("g1");
    expect(repos.guilds.get("g1")).toBeUndefined();
    expect(repos.subs.usersFor("g1", "drops")).toEqual([]);
  });
});
