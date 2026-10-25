import { MessageFlags, REST, Routes, type Interaction } from "discord.js";
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

export async function handleInteraction(interaction: Interaction, ctx: BotContext): Promise<void> {
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
    logger.error({ err, command: interaction.isCommand() ? interaction.commandName : undefined }, "Error atendiendo interacción");
    if (!interaction.isRepliable()) return;
    const content = "❌ Ha ocurrido un error. Inténtalo de nuevo en un momento.";
    if (interaction.deferred || interaction.replied) await interaction.editReply(content).catch(() => undefined);
    else await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => undefined);
  }
}
