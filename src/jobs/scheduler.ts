import { Cron } from "croner";
import type { AppContext } from "../context.js";
import { logger } from "../logger.js";
import type { Category } from "../types.js";
import { DropsJob } from "./dropsJob.js";
import { EpicJob } from "./epicJob.js";
import { PickemJob } from "./pickemJob.js";

export interface Jobs {
  epic: EpicJob;
  drops: DropsJob;
  pickem: PickemJob;
  forceForGuild(category: Category, guildId: string): Promise<string>;
  start(): void;
  stop(): void;
}

export function createJobs(ctx: AppContext): Jobs {
  const epic = new EpicJob(ctx);
  const drops = new DropsJob(ctx);
  const pickem = new PickemJob(ctx);
  const crons: Cron[] = [];
  const timers: NodeJS.Timeout[] = [];

  const schedule = (name: string, pattern: string, fn: () => Promise<void>) => {
    crons.push(
      new Cron(pattern, { name, timezone: ctx.config.TZ, protect: true }, async () => {
        const started = Date.now();
        try {
          await fn();
          logger.debug({ job: name, ms: Date.now() - started }, "Job completado");
        } catch (err) {
          logger.error({ job: name, err }, "Error en job");
        }
      }),
    );
  };

  return {
    epic,
    drops,
    pickem,
    forceForGuild(category, guildId) {
      return { epic, drops, pickem }[category].forceForGuild(guildId);
    },
    start() {
      // Una consulta al día a todas las fuentes; un fallo en una no impide las demás
      const daily = async () => {
        for (const [name, job] of [["epic", epic], ["drops", drops], ["pickem", pickem]] as const) {
          try {
            await job.run();
          } catch (err) {
            logger.error({ job: name, err }, "Error en job");
          }
        }
      };
      const [hour, minute] = ctx.config.DAILY_RUN_TIME.split(":").map(Number);
      schedule("diario", `${minute} ${hour} * * *`, daily);
      // Los recordatorios no consultan fuentes externas: solo miran la BD para avisar a su hora
      schedule("pickem-reminders", "*/10 * * * *", () => pickem.runReminders());

      // Primera pasada al arrancar, para no esperar hasta la hora diaria tras un despliegue
      timers.push(setTimeout(() => void daily(), 5_000));
      logger.info({ diario: ctx.config.DAILY_RUN_TIME, tz: ctx.config.TZ }, "Tareas programadas iniciadas");
    },
    stop() {
      for (const c of crons) c.stop();
      for (const t of timers) clearTimeout(t);
    },
  };
}
