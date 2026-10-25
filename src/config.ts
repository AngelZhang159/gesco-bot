import path from "node:path";
import { z } from "zod";

const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

const EnvSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, "Falta DISCORD_TOKEN"),
  DISCORD_CLIENT_ID: z.string().min(1, "Falta DISCORD_CLIENT_ID"),
  DEV_GUILD_ID: z.preprocess(emptyToUndefined, z.string().optional()),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  TZ: z.string().default("Europe/Madrid"),
  DATA_DIR: z.string().default(path.resolve("data")),
  CONFIG_DIR: z.string().default(path.resolve("config")),
  EPIC_LOCALE: z.string().default("es-ES"),
  EPIC_COUNTRY: z.string().default("ES"),
  DROPS_API_URL: z.string().url().default("https://twitch-drops-api.sunkwi.com/drops"),
  /** Hora (en TZ) de la consulta diaria a las fuentes. */
  DAILY_RUN_TIME: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Formato HH:MM, p. ej. 18:00").default("18:00"),
});

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Configuración inválida (.env):\n${problems}`);
  }
  return parsed.data;
}
