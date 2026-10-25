/**
 * Comprueba las fuentes en vivo, sin conectarse a Discord ni tocar la base de datos.
 *
 *   npm run check-sources              → todas
 *   npm run check-sources -- epic      → solo Epic
 *   npm run check-sources -- drops     → drops (y guarda el JSON crudo en tests/fixtures/drops-sunkwi.real.json)
 *   npm run check-sources -- pickem    → búsqueda de pick'em en noticias
 */
import fs from "node:fs";
import path from "node:path";
import type { CachedArticle } from "../src/db/repos/pickems.js";
import { fetchJson } from "../src/http.js";
import { parseSunkwiDrops } from "../src/sources/drops/sunkwi.js";
import { fetchEpicFreeGames } from "../src/sources/epic.js";
import { findPickemCandidates } from "../src/sources/pickem/newsProvider.js";
import { loadPickemSources } from "../src/sources/pickem/sources.js";

const which = process.argv[2] ?? "all";
const env = process.env;
const fmt = (ms: number | string | null) => (ms === null ? "—" : new Date(ms).toLocaleString("es-ES", { timeZone: env.TZ ?? "Europe/Madrid" }));

if (which === "all" || which === "epic") {
  console.log("\n=== Epic Games ===");
  const data = await fetchEpicFreeGames(env.EPIC_LOCALE ?? "es-ES", env.EPIC_COUNTRY ?? "ES");
  for (const g of data.current) console.log(`GRATIS  ${g.title} — hasta ${fmt(g.endAt)}  ${g.url}`);
  for (const g of data.upcoming) console.log(`PRÓXIMO ${g.title} — ${fmt(g.startAt)} → ${fmt(g.endAt)}`);
}

if (which === "all" || which === "drops") {
  console.log("\n=== Twitch Drops ===");
  const url = env.DROPS_API_URL ?? "https://twitch-drops-api.sunkwi.com/drops";
  try {
    const raw = await fetchJson<unknown>(url, { timeoutMs: 20_000 });
    const out = path.resolve("tests/fixtures/drops-sunkwi.real.json");
    fs.writeFileSync(out, JSON.stringify(raw, null, 2));
    console.log(`JSON crudo guardado en ${out}`);
    const campaigns = parseSunkwiDrops(raw);
    console.log(`${campaigns.length} campañas activas/próximas`);
    for (const c of campaigns.slice(0, 15)) {
      console.log(`- ${c.gameName}: ${c.name} (${fmt(c.startAt)} → ${fmt(c.endAt)}) · ${c.rewards.length} recompensas`);
    }
  } catch (err) {
    console.error(`ERROR: ${String(err)}`);
  }
}

if (which === "all" || which === "pickem") {
  console.log("\n=== Pick'em (noticias) ===");
  const mem = new Map<string, CachedArticle>();
  const candidates = await findPickemCandidates(loadPickemSources(env.CONFIG_DIR ?? path.resolve("config")), {
    tz: env.TZ ?? "Europe/Madrid",
    cache: { get: (k) => mem.get(k), put: (k, v) => void mem.set(k, v) },
    delayMs: 300,
  });
  if (candidates.length === 0) console.log("Ningún candidato en los últimos días.");
  for (const c of candidates) {
    console.log(`- [${c.gameName}] ${c.title}\n    cierre: ${fmt(c.deadlineAt)} (${c.confidence}) · publicado ${fmt(c.publishedAt)}\n    ${c.url}`);
  }
}
