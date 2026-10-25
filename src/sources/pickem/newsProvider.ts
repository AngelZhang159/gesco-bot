import { setTimeout as sleep } from "node:timers/promises";
import type { CachedArticle, DeadlineConfidence } from "../../db/repos/pickems.js";
import { fetchText } from "../../http.js";
import { logger } from "../../logger.js";
import { fetchArticleText, resolveArticleUrl } from "./article.js";
import { extractDeadline, isPickemTitle, mentionsOtherYear } from "./extract.js";
import { cleanTitle, isGoogleNewsLink, parseRss, type NewsItem } from "./rss.js";
import type { PickemGame, PickemSources } from "./sources.js";

export interface PickemCandidate {
  gameKey: string;
  gameName: string;
  title: string;
  url: string;
  publishedAt: number;
  deadlineAt: number | null;
  confidence: DeadlineConfidence;
  /** El artículo solo habla de cierres ya pasados. */
  closed: boolean;
}

export interface ArticleCache {
  get(link: string): CachedArticle | undefined;
  put(link: string, article: CachedArticle): void;
}

export interface NewsProviderDeps {
  cache: ArticleCache;
  tz: string;
  now?: () => Date;
  /** Pausa entre peticiones a los feeds para no saturarlos. */
  delayMs?: number;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function titleMentionsGame(title: string, game: PickemGame): boolean {
  return game.aliases.some((a) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(a)}($|[^\\p{L}\\p{N}])`, "iu").test(title));
}

/** Ítems del feed que parecen un pick'em reciente del juego. */
export function filterPickemItems(items: NewsItem[], game: PickemGame, maxAgeDays: number, at: Date): NewsItem[] {
  const minDate = at.getTime() - maxAgeDays * 24 * 3600_000;
  return items.filter(
    (it) =>
      // Sin fecha de publicación no podemos saber si es de este año: se descarta
      !!it.publishedAt &&
      it.publishedAt.getTime() >= minDate &&
      titleMentionsGame(it.title, game) &&
      isPickemTitle(it.title) &&
      !mentionsOtherYear(it.title, at),
  );
}

/** Busca en los feeds de noticias pick'em de los juegos configurados y extrae su fecha límite. */
export async function findPickemCandidates(sources: PickemSources, deps: NewsProviderDeps): Promise<PickemCandidate[]> {
  const now = deps.now ?? (() => new Date());
  const delayMs = deps.delayMs ?? 750;
  const candidates: PickemCandidate[] = [];
  let feedErrors = 0;
  let feedCalls = 0;

  for (const game of sources.games) {
    const seenTitles = new Set<string>();
    const items: NewsItem[] = [];

    for (const query of game.queries) {
      for (const feed of sources.feeds) {
        feedCalls++;
        const url = feed.replace("{query}", encodeURIComponent(query));
        try {
          const parsed = parseRss(await fetchText(url, { retries: 1 }));
          for (const it of filterPickemItems(parsed, game, sources.maxAgeDays, now())) {
            const title = isGoogleNewsLink(it.link) ? cleanTitle(it.title) : it.title;
            const key = title.toLowerCase().replace(/\W+/g, " ").trim();
            if (seenTitles.has(key)) continue;
            seenTitles.add(key);
            items.push({ ...it, title });
          }
        } catch (err) {
          feedErrors++;
          logger.warn({ feed: url, err: String(err) }, "Fallo leyendo feed de noticias");
        }
        if (delayMs) await sleep(delayMs);
      }
    }

    for (const item of items) {
      const article = await analyseItem(item, deps, now());
      if (!article.resolved_url && isGoogleNewsLink(item.link)) {
        // Sin URL real no podemos enlazar el artículo: usamos el de Google News, que redirige
        article.resolved_url = item.link;
      }
      candidates.push({
        gameKey: game.key,
        gameName: game.name,
        title: item.title,
        url: article.resolved_url ?? item.link,
        publishedAt: (item.publishedAt ?? now()).getTime(),
        deadlineAt: article.deadline_at,
        confidence: article.deadline_confidence,
        closed: article.closed === 1,
      });
    }
  }

  if (feedCalls > 0 && feedErrors === feedCalls) {
    throw new Error("No se pudo leer ningún feed de noticias (¿sin conexión o bloqueo?)");
  }
  return candidates;
}

async function analyseItem(item: NewsItem, deps: NewsProviderDeps, at: Date): Promise<CachedArticle> {
  const cached = deps.cache.get(item.link);
  // Se reutiliza salvo que su fecha ya haya pasado: el artículo podría tener otra fase más adelante.
  // Los "cerrados" (deadline_at null) también se reutilizan: sus fechas no van a volver a ser futuras.
  if (cached && (cached.deadline_at === null || cached.deadline_at > at.getTime())) return { ...cached };

  const resolved = await resolveArticleUrl(item.link);
  const body = resolved && !isGoogleNewsLink(resolved) ? await fetchArticleText(resolved) : null;
  const text = [item.title, item.description, body ?? ""].join("\n");
  const { deadlineAt, confidence, closed } = extractDeadline(text, {
    reference: item.publishedAt ?? at,
    now: at,
    tz: deps.tz,
  });

  const result: CachedArticle = {
    resolved_url: resolved,
    deadline_at: deadlineAt,
    deadline_confidence: confidence,
    closed: closed ? 1 : 0,
  };
  deps.cache.put(item.link, result);
  logger.debug({ title: item.title, url: resolved, deadlineAt, confidence, closed, body: !!body }, "Artículo de pick'em analizado");
  return result;
}
