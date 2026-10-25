import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const GameSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)).min(1),
  queries: z.array(z.string().min(1)).min(1),
});

const SourcesSchema = z.object({
  maxAgeDays: z.number().positive().default(7),
  feeds: z.array(z.string().includes("{query}")).min(1),
  games: z.array(GameSchema).min(1),
});

export type PickemGame = z.infer<typeof GameSchema>;
export type PickemSources = z.infer<typeof SourcesSchema>;

/** Se relee en cada ciclo para que los cambios en el JSON se apliquen sin reiniciar. */
export function loadPickemSources(configDir: string): PickemSources {
  const file = path.join(configDir, "pickem-sources.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  const parsed = SourcesSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${file} no es válido: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  return parsed.data;
}
