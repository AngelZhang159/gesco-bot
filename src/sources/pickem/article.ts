import * as cheerio from "cheerio";
import { fetchText } from "../../http.js";
import { logger } from "../../logger.js";
import { isGoogleNewsLink, unwrapBingLink } from "./rss.js";

const MAX_TEXT = 60_000;

/** Obtiene la URL real de un enlace de feed (Google News la codifica, Bing la envuelve). */
export async function resolveArticleUrl(link: string): Promise<string | null> {
  if (!isGoogleNewsLink(link)) return unwrapBingLink(link);
  try {
    return await decodeGoogleNewsUrl(link);
  } catch (err) {
    logger.debug({ link, err: String(err) }, "No se pudo decodificar el enlace de Google News");
    return null;
  }
}

/**
 * Google News ya no incluye la URL del artículo en el feed. La página del artículo expone una firma
 * (data-n-a-sg) y un timestamp (data-n-a-ts) con los que el endpoint batchexecute devuelve la URL real.
 */
async function decodeGoogleNewsUrl(link: string): Promise<string | null> {
  const id = new URL(link).pathname.split("/").pop();
  if (!id) return null;
  const html = await fetchText(`https://news.google.com/articles/${id}?hl=en-US&gl=US&ceid=US:en`, { retries: 1 });
  const sg = /data-n-a-sg="([^"]+)"/.exec(html)?.[1];
  const ts = /data-n-a-ts="([^"]+)"/.exec(html)?.[1];
  if (!sg || !ts) return null;

  const inner = JSON.stringify([
    "garturlreq",
    [["X", "X", ["X", "X"], null, null, 1, 1, "US:en", null, 1, null, null, null, null, null, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
    id,
    Number(ts),
    sg,
  ]);
  const res = await fetch("https://news.google.com/_/DotsSplashUi/data/batchexecute", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": "Mozilla/5.0" },
    body: new URLSearchParams({ "f.req": JSON.stringify([[["Fbv4je", inner, null, "generic"]]]) }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  return parseBatchExecuteUrl(await res.text());
}

/** Respuesta: `)]}'\n\n[["wrb.fr","Fbv4je","[\"garturlres\",\"https://...\",1]",...]]` */
export function parseBatchExecuteUrl(body: string): string | null {
  const json = body.slice(body.indexOf("["));
  try {
    const outer = JSON.parse(json) as unknown[][];
    for (const entry of outer) {
      if (entry[0] !== "wrb.fr" || typeof entry[2] !== "string") continue;
      const inner = JSON.parse(entry[2]) as unknown[];
      if (inner[0] === "garturlres" && typeof inner[1] === "string") return inner[1];
    }
  } catch {
    // formato inesperado
  }
  return null;
}

/** Descarga el artículo y devuelve su texto, o null si no se puede (bloqueo, timeout, JS...). */
export async function fetchArticleText(url: string): Promise<string | null> {
  try {
    const html = await fetchText(url, { retries: 1, timeoutMs: 15_000 });
    return htmlToArticleText(html);
  } catch (err) {
    logger.debug({ url, err: String(err) }, "No se pudo descargar el artículo");
    return null;
  }
}

export function htmlToArticleText(html: string): string | null {
  const $ = cheerio.load(html);
  const title = $("title").first().text();
  if (/attention required|just a moment|access denied/i.test(title)) return null;

  const parts: string[] = [];
  const metaDescription = $('meta[name="description"], meta[property="og:description"]').first().attr("content");
  if (metaDescription) parts.push(metaDescription);

  // Muchos medios incluyen el cuerpo en JSON-LD aunque la página se pinte con JS
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).text()) as unknown;
      for (const node of Array.isArray(data) ? data : [data]) {
        const body = (node as { articleBody?: unknown })?.articleBody;
        if (typeof body === "string") parts.push(body);
      }
    } catch {
      // JSON-LD mal formado: se ignora
    }
  });

  $("script, style, noscript, nav, header, footer, aside, form, iframe, svg").remove();
  const root = $("article").first().length ? $("article").first() : $("main").first().length ? $("main").first() : $("body");
  // Separar bloques para no pegar frases de párrafos distintos
  root.find("p, li, h1, h2, h3, h4, td, br, div").each((_, el) => {
    $(el).append("\n");
  });
  parts.push(root.text());

  const text = parts
    .join("\n")
    .replace(/[^\S\n]+/g, " ") // cualquier espacio (incluido &nbsp;) salvo saltos de línea
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return text ? text.slice(0, MAX_TEXT) : null;
}
