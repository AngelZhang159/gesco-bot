import crypto from "node:crypto";
import { fetchJson } from "../http.js";

export interface FreeGame {
  id: string;
  title: string;
  description: string;
  url: string;
  image: string | null;
  originalPrice: string | null;
  startAt: string;
  endAt: string;
  mystery: boolean;
}

export interface EpicFreeGames {
  current: FreeGame[];
  upcoming: FreeGame[];
}

interface PromoOffer {
  startDate: string;
  endDate: string;
  discountSetting?: { discountType?: string; discountPercentage?: number };
}

interface EpicElement {
  id: string;
  title: string;
  description?: string;
  productSlug?: string | null;
  urlSlug?: string | null;
  offerType?: string;
  catalogNs?: { mappings?: { pageSlug: string; pageType?: string }[] | null };
  offerMappings?: { pageSlug: string; pageType?: string }[] | null;
  keyImages?: { type: string; url: string }[];
  price?: { totalPrice?: { discountPrice?: number; originalPrice?: number; fmtPrice?: { originalPrice?: string } } };
  promotions?: {
    promotionalOffers?: { promotionalOffers: PromoOffer[] }[];
    upcomingPromotionalOffers?: { promotionalOffers: PromoOffer[] }[];
  } | null;
}

interface EpicResponse {
  data?: { Catalog?: { searchStore?: { elements?: EpicElement[] } } };
}

export function epicApiUrl(locale: string, country: string): string {
  const q = new URLSearchParams({ locale, country, allowCountries: country });
  return `https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?${q}`;
}

export async function fetchEpicFreeGames(locale: string, country: string): Promise<EpicFreeGames> {
  const json = await fetchJson<EpicResponse>(epicApiUrl(locale, country));
  return parseEpicFreeGames(json, locale);
}

/** En Epic, discountPercentage 0 significa "100 % de descuento" (gratis); el resto son rebajas. */
const isFreeOffer = (o: PromoOffer) => o.discountSetting?.discountPercentage === 0;

export function parseEpicFreeGames(json: EpicResponse, locale = "es-ES", at = new Date()): EpicFreeGames {
  const elements = json.data?.Catalog?.searchStore?.elements;
  if (!Array.isArray(elements)) throw new Error("Respuesta de Epic con formato inesperado");

  const current: FreeGame[] = [];
  const upcoming: FreeGame[] = [];

  for (const el of elements) {
    const promos = el.promotions;
    if (!promos) continue;

    const active = (promos.promotionalOffers ?? []).flatMap((g) => g.promotionalOffers);
    const freeNow = active.find(
      (o) => isFreeOffer(o) && new Date(o.startDate) <= at && new Date(o.endDate) > at,
    );
    if (freeNow && el.price?.totalPrice?.discountPrice === 0) {
      current.push(toFreeGame(el, freeNow, locale));
      continue;
    }

    const next = (promos.upcomingPromotionalOffers ?? [])
      .flatMap((g) => g.promotionalOffers)
      .filter((o) => isFreeOffer(o) && new Date(o.endDate) > at)
      .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
    if (next) upcoming.push(toFreeGame(el, next, locale));
  }

  const byEnd = (a: FreeGame, b: FreeGame) => a.endAt.localeCompare(b.endAt) || a.title.localeCompare(b.title);
  current.sort(byEnd);
  upcoming.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.title.localeCompare(b.title));
  return { current, upcoming };
}

function toFreeGame(el: EpicElement, offer: PromoOffer, locale: string): FreeGame {
  const mystery = /mystery game|juego misterioso/i.test(el.title);
  const slug =
    el.productSlug?.replace(/\/home$/, "") ||
    el.catalogNs?.mappings?.find((m) => m.pageType === "productHome")?.pageSlug ||
    el.catalogNs?.mappings?.[0]?.pageSlug ||
    el.offerMappings?.[0]?.pageSlug;
  const url = slug && !mystery
    ? `https://store.epicgames.com/${locale}/p/${slug}`
    : `https://store.epicgames.com/${locale}/free-games`;
  const image =
    el.keyImages?.find((k) => k.type === "OfferImageWide")?.url ??
    el.keyImages?.find((k) => k.type === "DieselStoreFrontWide")?.url ??
    el.keyImages?.find((k) => k.type === "Thumbnail")?.url ??
    null;

  return {
    id: el.id,
    title: el.title,
    description: el.description && el.description !== el.title ? el.description : "",
    url,
    image,
    originalPrice: el.price?.totalPrice?.fmtPrice?.originalPrice ?? null,
    startAt: offer.startDate,
    endAt: offer.endDate,
    mystery,
  };
}

/** Identifica el "lote" semanal: cambia cuando cambian los juegos gratis actuales o su fecha de fin. */
export function epicBatchId(games: FreeGame[]): string {
  const key = games
    .map((g) => `${g.id}:${g.endAt}`)
    .sort()
    .join("|");
  return crypto.createHash("sha1").update(key).digest("hex").slice(0, 16);
}
