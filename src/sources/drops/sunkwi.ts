import { fetchJson } from "../../http.js";
import { gameKey } from "../../types.js";
import { twitchGameUrl, type DropCampaign, type DropReward, type DropsSource } from "./types.js";

/**
 * Adaptador para el agregador comunitario https://twitch-drops-api.sunkwi.com/drops.
 *
 * El JSON replica las estructuras de la API interna de Twitch (DropCampaign, timeBasedDrops,
 * benefitEdges...), agrupadas por juego. El parseo es tolerante a variaciones de nombres de campos
 * porque no es una API documentada: si cambia de forma, falla con un error claro en vez de
 * devolver una lista vacía (que se interpretaría como "no hay drops").
 */
export class SunkwiDropsSource implements DropsSource {
  readonly name = "sunkwi";

  constructor(private readonly url: string) {}

  async fetch(): Promise<DropCampaign[]> {
    const json = await fetchJson<unknown>(this.url, { timeoutMs: 20_000 });
    return parseSunkwiDrops(json);
  }
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (...vals: unknown[]): string | undefined =>
  vals.find((v): v is string => typeof v === "string" && v.trim() !== "")?.trim();
const num = (...vals: unknown[]): number | undefined => vals.find((v): v is number => typeof v === "number");
const arr = (...vals: unknown[]): unknown[] => (vals.find(Array.isArray) as unknown[] | undefined) ?? [];

function boxArt(url: string | undefined): string | null {
  return url ? url.replace("{width}", "285").replace("{height}", "380") : null;
}

export function parseSunkwiDrops(json: unknown, at = new Date()): DropCampaign[] {
  const root = isObj(json) ? arr(json.data, json.drops, json.games, json.campaigns) : json;
  if (!Array.isArray(root)) throw new Error("Respuesta de drops con formato inesperado (no es una lista)");

  const campaigns = new Map<string, DropCampaign>();

  for (const entry of root) {
    if (!isObj(entry)) continue;
    const entryGame = isObj(entry.game) ? entry.game : {};
    const nested = arr(entry.rewards, entry.campaigns, entry.dropCampaigns);
    // Entrada de juego con sus campañas dentro, o directamente una campaña
    const list = nested.length > 0 ? nested : [entry];

    for (const raw of list) {
      if (!isObj(raw)) continue;
      const game = isObj(raw.game) ? raw.game : entryGame;
      const gameName = str(entry.gameDisplayName, entry.gameName, game.displayName, game.name, entry.name);
      const id = str(raw.id, raw.campaignId);
      const startAt = str(raw.startAt, raw.startDate, entry.startAt);
      const endAt = str(raw.endAt, raw.endDate, entry.endAt);
      if (!gameName || !id || !startAt || !endAt) continue;
      if (new Date(endAt) <= at) continue;
      if (str(raw.status)?.toUpperCase() === "EXPIRED") continue;

      campaigns.set(id, {
        id,
        gameKey: gameKey(gameName),
        gameName,
        boxArt: boxArt(str(entry.gameBoxArtURL, game.boxArtURL, raw.gameBoxArtURL)),
        name: str(raw.name, raw.campaignName) ?? gameName,
        startAt,
        endAt,
        rewards: parseRewards(raw),
        url: str(raw.detailsURL, raw.detailsUrl) ?? twitchGameUrl(gameName),
        accountLinkUrl: str(raw.accountLinkURL, raw.accountLinkUrl) ?? null,
      });
    }
  }

  if (root.length > 0 && campaigns.size === 0 && root.some((e) => isObj(e) && !isExpiredEntry(e, at))) {
    throw new Error("Respuesta de drops con formato inesperado (no se reconoció ninguna campaña)");
  }
  return [...campaigns.values()].sort((a, b) => a.gameName.localeCompare(b.gameName) || a.endAt.localeCompare(b.endAt));
}

function isExpiredEntry(e: Obj, at: Date): boolean {
  const end = str(e.endAt, e.endDate);
  return !!end && new Date(end) <= at;
}

function parseRewards(campaign: Obj): DropReward[] {
  const rewards: DropReward[] = [];
  const seen = new Set<string>();
  for (const drop of arr(campaign.timeBasedDrops, campaign.drops, campaign.rewards)) {
    if (!isObj(drop)) continue;
    const minutes = num(drop.requiredMinutesWatched, drop.minutes) ?? null;
    const edges = arr(drop.benefitEdges, drop.benefits);
    const benefits = edges.length > 0 ? edges.map((e) => (isObj(e) && isObj(e.benefit) ? e.benefit : e)) : [drop];
    for (const b of benefits) {
      if (!isObj(b)) continue;
      const name = str(b.name, drop.name);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      rewards.push({ name, image: str(b.imageAssetURL, b.imageURL, b.image) ?? null, minutes });
    }
  }
  return rewards;
}
