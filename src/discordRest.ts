import { Routes, type Client } from "discord.js";
import { Agent } from "undici";
import { logger } from "./logger.js";

/**
 * Discord solo da 3 s para responder a un comando, y abrir una conexión nueva con su API puede costar
 * más (con la VPN del minipc tarda a veces 4 s). Por defecto undici cierra la conexión tras 4 s sin uso,
 * así que casi cada comando abría una nueva: se mantiene abierta con un keep-alive largo y un ping
 * periódico, y las respuestas salen por una conexión ya establecida.
 */
const PING_MS = 30_000;

export const restAgent = new Agent({ keepAliveTimeout: 2 * PING_MS, keepAliveMaxTimeout: 10 * 60_000 });

/** Empieza el ping periódico a la API; devuelve la función que lo detiene. */
export function keepRestWarm(client: Client): () => void {
  const ping = () =>
    client.rest
      .get(Routes.gateway(), { auth: false })
      .catch((err: unknown) => logger.debug({ err: String(err) }, "Ping a la API de Discord fallido"));
  const timer = setInterval(() => void ping(), PING_MS);
  return () => clearInterval(timer);
}
