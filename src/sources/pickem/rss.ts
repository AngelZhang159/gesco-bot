import { XMLParser } from "fast-xml-parser";

export interface NewsItem {
  title: string;
  /** Enlace tal como viene en el feed (puede ser una redirección de Google/Bing). */
  link: string;
  description: string;
  publishedAt: Date | null;
}

const parser = new XMLParser({ ignoreAttributes: true, processEntities: true, htmlEntities: true });

export function parseRss(xml: string): NewsItem[] {
  const doc = parser.parse(xml) as { rss?: { channel?: { item?: unknown } } };
  const rawItems = doc.rss?.channel?.item;
  if (rawItems === undefined) {
    if (!doc.rss) throw new Error("El feed no es RSS");
    return [];
  }
  const list = Array.isArray(rawItems) ? rawItems : [rawItems];

  return list.flatMap((it) => {
    const item = it as Record<string, unknown>;
    const title = typeof item.title === "string" ? item.title.trim() : String(item.title ?? "").trim();
    const link = typeof item.link === "string" ? item.link.trim() : "";
    if (!title || !link) return [];
    const pub = typeof item.pubDate === "string" ? new Date(item.pubDate) : null;
    return [
      {
        title,
        link,
        description: stripHtml(String(item.description ?? "")),
        publishedAt: pub && !Number.isNaN(pub.getTime()) ? pub : null,
      },
    ];
  });
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Google News añade " - Medio" al final del título. */
export function cleanTitle(title: string): string {
  return title.replace(/\s+[-–|]\s+[^-–|]{2,40}$/, "").trim();
}

/** Bing News envuelve el enlace real en apiclick.aspx?url=... */
export function unwrapBingLink(link: string): string {
  try {
    const u = new URL(link);
    if (u.hostname.endsWith("bing.com") && u.searchParams.has("url")) return u.searchParams.get("url")!;
  } catch {
    // enlace no válido: se devuelve tal cual
  }
  return link;
}

export const isGoogleNewsLink = (link: string) => /^https?:\/\/news\.google\.com\/(rss\/)?articles\//.test(link);
