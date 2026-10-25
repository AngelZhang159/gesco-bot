import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSunkwiDrops } from "../src/sources/drops/sunkwi.js";
import { epicBatchId, parseEpicFreeGames } from "../src/sources/epic.js";
import { parseBatchExecuteUrl, htmlToArticleText } from "../src/sources/pickem/article.js";
import { filterPickemItems, titleMentionsGame } from "../src/sources/pickem/newsProvider.js";
import { cleanTitle, parseRss, unwrapBingLink } from "../src/sources/pickem/rss.js";

const fixture = (name: string) => fs.readFileSync(path.join(import.meta.dirname, "fixtures", name), "utf8");

describe("Epic", () => {
  const json = JSON.parse(fixture("epic-2026-10-25.json"));
  const at = new Date("2026-10-25T12:00:00Z");

  it("solo devuelve los juegos gratis de verdad (no las rebajas)", () => {
    const { current } = parseEpicFreeGames(json, "es-ES", at);
    expect(current.map((g) => g.title)).toEqual(["Home - A Unique Horror Adventure", "Sker Ritual"]);
    const sker = current.find((g) => g.title === "Sker Ritual")!;
    expect(sker.endAt).toBe("2026-10-29T15:00:00.000Z");
    expect(sker.url).toBe("https://store.epicgames.com/es-ES/p/sker-ritual-aac702");
    expect(sker.image).toMatch(/^https:\/\/cdn1\.epicgames\.com\//);
  });

  it("los próximos gratis excluyen rebajas futuras", () => {
    const { upcoming } = parseEpicFreeGames(json, "es-ES", at);
    expect(upcoming.map((g) => g.title)).toEqual(["Sorry We're Closed"]);
    expect(upcoming[0]!.startAt).toBe("2026-10-29T15:00:00.000Z");
  });

  it("el id de lote es estable e independiente del orden", () => {
    const { current } = parseEpicFreeGames(json, "es-ES", at);
    expect(epicBatchId(current)).toBe(epicBatchId([...current].reverse()));
    expect(epicBatchId(current)).not.toBe(epicBatchId(current.slice(0, 1)));
  });

  it("falla con un formato inesperado", () => {
    expect(() => parseEpicFreeGames({ data: {} })).toThrow(/formato inesperado/);
  });
});

describe("Twitch Drops (sunkwi)", () => {
  const json = JSON.parse(fixture("drops-sunkwi.sample.json"));
  const at = new Date("2026-10-25T12:00:00Z");

  it("normaliza campañas agrupadas por juego y descarta las caducadas", () => {
    const campaigns = parseSunkwiDrops(json, at);
    expect(campaigns.map((c) => c.name)).toEqual(["Rust Drops Week 47", "Champions Watch Party"]);
    const rust = campaigns[0]!;
    expect(rust.gameKey).toBe("rust");
    expect(rust.boxArt).toBe("https://static-cdn.jtvnw.net/ttv-boxart/263490_IGDB-285x380.jpg");
    expect(rust.rewards).toEqual([
      { name: "Streamer Hoodie", image: "https://example.com/hoodie.png", minutes: 120 },
      { name: "Streamer Pants", image: "https://example.com/pants.png", minutes: 240 },
    ]);
    expect(rust.accountLinkUrl).toBe("https://twitch.facepunch.com/connect");
  });

  it("si un drop no tiene beneficios usa el nombre del drop y el enlace de Twitch del juego", () => {
    const valorant = parseSunkwiDrops(json, at).find((c) => c.gameKey === "valorant")!;
    expect(valorant.rewards).toEqual([{ name: "Gun Buddy", image: null, minutes: 60 }]);
    expect(valorant.url).toBe("https://www.twitch.tv/directory/game/VALORANT?filter=drops");
  });

  it("acepta una lista plana de campañas con el juego anidado", () => {
    const flat = [{ id: "x1", name: "Camp", startAt: "2026-10-01T00:00:00Z", endAt: "2026-12-01T00:00:00Z", game: { displayName: "Marvel Rivals" } }];
    expect(parseSunkwiDrops(flat, at)[0]).toMatchObject({ id: "x1", gameName: "Marvel Rivals", gameKey: "marvel rivals" });
  });

  it("parsea una muestra de la respuesta real de la API", () => {
    const real = JSON.parse(fixture("drops-sunkwi.real-sample.json"));
    const campaigns = parseSunkwiDrops(real, new Date("2026-10-25T12:00:00Z"));
    expect(campaigns.map((c) => c.gameName)).toEqual(["Epic Seven", "Eternal Return", "Marbles on Stream", "RavenQuest"]);
    for (const c of campaigns) {
      expect(c.rewards.length).toBeGreaterThan(0);
      expect(c.boxArt).toMatch(/^https:\/\//);
      expect(c.url).toMatch(/^https?:\/\//);
    }
    // Pasada la fecha de fin, no queda ninguna
    expect(parseSunkwiDrops(real, new Date("2026-10-26T00:00:00Z"))).toEqual([]);
  });

  it("falla (en vez de devolver vacío) si no reconoce el formato", () => {
    expect(() => parseSunkwiDrops([{ foo: "bar" }], at)).toThrow(/formato inesperado/);
    expect(() => parseSunkwiDrops("<html>", at)).toThrow(/formato inesperado/);
    expect(parseSunkwiDrops([], at)).toEqual([]);
  });
});

describe("RSS de noticias", () => {
  it("parsea Google News", () => {
    const items = parseRss(fixture("google-rss.xml"));
    expect(items.length).toBeGreaterThan(10);
    expect(items[0]!.title).toContain("Pick'Em");
    expect(items[0]!.publishedAt?.toISOString()).toBe("2026-10-21T15:37:21.000Z");
  });

  it("parsea Bing News y extrae la URL real", () => {
    const [item] = parseRss(fixture("bing-rss.xml"));
    expect(unwrapBingLink(item!.link)).toBe("https://note.com/purion_me_4123/n/nf450200027ce?hl=en");
  });

  it("limpia el sufijo del medio en títulos de Google", () => {
    expect(cleanTitle("Worlds 2026 Pick'Em Guide: Swiss Stage Predictions & Rewards - EGamersWorld")).toBe(
      "Worlds 2026 Pick'Em Guide: Swiss Stage Predictions & Rewards",
    );
  });

  it("filtra por juego, palabra clave, antigüedad y año", () => {
    const lol = { key: "lol", name: "League of Legends", aliases: ["League of Legends", "LoL", "Worlds"], queries: ["x"] };
    const items = parseRss(fixture("google-rss.xml"));
    const kept = filterPickemItems(items, lol, 7, new Date("2026-10-25T12:00:00Z"));
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((i) => /pick.?em|prediction/i.test(i.title))).toBe(true);
    expect(kept.some((i) => /NFL/i.test(i.title))).toBe(false);
  });

  it("los alias se buscan como palabra completa", () => {
    const game = { key: "lol", name: "LoL", aliases: ["LoL", "Worlds"], queries: ["x"] };
    expect(titleMentionsGame("LoL Worlds pick'em", game)).toBe(true);
    expect(titleMentionsGame("World Series pick'em", game)).toBe(false);
    expect(titleMentionsGame("Lollapalooza pick'em", game)).toBe(false);
  });
});

describe("Artículos", () => {
  it("decodifica la respuesta de batchexecute de Google News", () => {
    const body = `)]}'\n\n[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://egamersworld.com/blog/worlds\\",1]",null,null,null,"generic"],["di",12]]`;
    expect(parseBatchExecuteUrl(body)).toBe("https://egamersworld.com/blog/worlds");
    expect(parseBatchExecuteUrl("basura")).toBeNull();
  });

  it("extrae el texto del artículo y detecta páginas de bloqueo", () => {
    const html = `<html><head><title>Guide</title><meta name="description" content="Picks lock Nov 3."></head>
      <body><nav>menu</nav><article><p>Swiss picks open today.</p><p>They lock on November 3.</p></article></body></html>`;
    const text = htmlToArticleText(html)!;
    expect(text).toContain("Picks lock Nov 3.");
    expect(text).toContain("They lock on November 3.");
    expect(text).not.toContain("menu");
    expect(htmlToArticleText("<html><head><title>Attention Required! | Cloudflare</title></head></html>")).toBeNull();
  });
});
