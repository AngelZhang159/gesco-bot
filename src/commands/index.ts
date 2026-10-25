import { DiscordAPIError, MessageFlags, REST, RESTJSONErrorCodes, Routes, type Interaction } from "discord.js";
import type { AppConfig } from "../config.js";
import { handleButton } from "../interactions/buttons.js";
import { logger } from "../logger.js";
import { avisos } from "./avisos.js";
import { ayuda } from "./ayuda.js";
import { config } from "./config.js";
import { drops } from "./drops.js";
import { epic } from "./epic.js";
import { pickem } from "./pickem.js";
import type { BotContext, Command } from "./types.js";

export const commands: Command[] = [ayuda, config, avisos, drops, epic, pickem];
const byName = new Map(commands.map((c) => [c.data.name, c]));

/** Registra los comandos: en DEV_GUILD_ID es instantáneo; globalmente puede tardar hasta 1 h en verse. */
export async function registerCommands(cfg: AppConfig): Promise<void> {
  const rest = new REST().setToken(cfg.DISCORD_TOKEN);
  const body = commands.map((c) => c.data.toJSON());
  if (cfg.DEV_GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(cfg.DISCORD_CLIENT_ID, cfg.DEV_GUILD_ID), { body });
    logger.info({ guild: cfg.DEV_GUILD_ID, count: body.length }, "Comandos registrados en el servidor de pruebas");
  } else {
    await rest.put(Routes.applicationCommands(cfg.DISCORD_CLIENT_ID), { body });
    logger.info({ count: body.length }, "Comandos registrados globalmente");
  }
}

// La interacción ya no admite respuesta: caducó (Discord espera 3 s) u otro proceso la contestó antes
const GONE_CODES = new Set<number | string>([
  RESTJSONErrorCodes.UnknownInteraction,
  RESTJSONErrorCodes.InteractionHasAlreadyBeenAcknowledged,
]);

export async function handleInteraction(interaction: Interaction, ctx: BotContext): Promise<void> {
  const receivedAfterMs = Date.now() - interaction.createdTimestamp;
  if (!interaction.inCachedGuild()) {
    if (interaction.isRepliable()) {
      await interaction.reply({ content: "Este bot solo funciona dentro de un servidor.", flags: MessageFlags.Ephemeral });
    }
    return;
  }

  try {
    if (interaction.isChatInputCommand()) {
      await byName.get(interaction.commandName)?.execute(interaction, ctx);
    } else if (interaction.isAutocomplete()) {
      await byName.get(interaction.commandName)?.autocomplete?.(interaction, ctx);
    } else if (interaction.isButton()) {
      await handleButton(interaction, ctx);
    }
  } catch (err) {
    const command = interaction.isCommand() ? interaction.commandName : undefined;
    if (err instanceof DiscordAPIError && GONE_CODES.has(err.code)) {
      // Si se respondió a tiempo, casi siempre es otra instancia del bot con el mismo token
      const respondedAfterMs = Date.now() - interaction.createdTimestamp;
      logger.warn(
        { command, code: err.code, recibidaTrasMs: receivedAfterMs, respuestaTrasMs: respondedAfterMs },
        respondedAfterMs < 3000
          ? "Otro proceso respondió a la interacción antes: ¿hay otra instancia del bot con el mismo token?"
          : "La respuesta llegó tarde: Discord solo espera 3 s",
      );
      return;
    }
    logger.error({ err, command }, "Error atendiendo interacción");
    if (!interaction.isRepliable()) return;
    const content = "❌ Ha ocurrido un error. Inténtalo de nuevo en un momento.";
    if (interaction.deferred || interaction.replied) await interaction.editReply(content).catch(() => undefined);
    else await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
  }
}
