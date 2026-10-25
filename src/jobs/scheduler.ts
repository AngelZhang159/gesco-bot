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
      // Epic cambia los jueves a las 17:00 (Madrid); cada hora basta
      schedule("epic", "5 * * * *", () => epic.run());
      schedule("drops", "*/30 * * * *", () => drops.run());
      schedule("pickem", "15 */2 * * *", () => pickem.run());
      schedule("pickem-reminders", "*/10 * * * *", () => pickem.runReminders());

      // Primera pasada al arrancar, escalonada
      const initial: [number, () => Promise<void>][] = [
        [5_000, () => epic.run()],
        [15_000, () => drops.run()],
        [30_000, () => pickem.run()],
      ];
      for (const [delay, fn] of initial) {
        timers.push(setTimeout(() => fn().catch((err: unknown) => logger.error({ err }, "Error en la primera pasada")), delay));
      }
      logger.info("Tareas programadas iniciadas");
    },
    stop() {
      for (const c of crons) c.stop();
      for (const t of timers) clearTimeout(t);
    },
  };
}
