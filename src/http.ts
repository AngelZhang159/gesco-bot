import { setTimeout as sleep } from "node:timers/promises";
import { logger } from "./logger.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 bot-discord-noticias/1.0";

export interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * fetch con timeout, reintentos con backoff exponencial y User-Agent de navegador.
 * Si HTTPS_PROXY está definido y NODE_USE_ENV_PROXY=1, Node enruta las peticiones por el proxy.
 */
async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = 15_000, retries = 3, headers = {} } = opts;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "es-ES,es;q=0.9,en;q=0.8", ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
      });
      // 4xx (salvo 429) no mejora reintentando
      if (!res.ok && (res.status === 429 || res.status >= 500)) {
        throw new HttpError(`HTTP ${res.status} en ${url}`, res.status);
      }
      if (!res.ok) throw Object.assign(new HttpError(`HTTP ${res.status} en ${url}`, res.status), { fatal: true });
      return res;
    } catch (err) {
      lastError = err;
      if ((err as { fatal?: boolean }).fatal || attempt === retries) break;
      const delay = 1000 * 2 ** attempt;
      logger.debug({ url, attempt, err: String(err) }, `Reintentando en ${delay} ms`);
      await sleep(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new HttpError(String(lastError));
}

export async function fetchText(url: string, opts?: FetchOptions): Promise<string> {
  const res = await fetchWithRetry(url, opts);
  return res.text();
}

export async function fetchJson<T = unknown>(url: string, opts?: FetchOptions): Promise<T> {
  const res = await fetchWithRetry(url, { ...opts, headers: { Accept: "application/json", ...opts?.headers } });
  const contentType = res.headers.get("content-type") ?? "";
  const body = await res.text();
  if (!contentType.includes("json") && !/^\s*[[{]/.test(body)) {
    // Típico de bloqueos (p. ej. LaLiga/Cloudflare en España): devuelven una página HTML con 200
    throw new HttpError(`Respuesta no JSON de ${url} (¿bloqueo de red?): ${body.slice(0, 120).replace(/\s+/g, " ")}`);
  }
  return JSON.parse(body) as T;
}
