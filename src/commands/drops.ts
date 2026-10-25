import { EmbedBuilder, InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { buildDropsView, INITIAL_VIEW } from "../interactions/dropsView.js";
import { COLORS, truncate } from "../notifier/embeds.js";
import { gameKey } from "../types.js";
import type { BotContext, Command } from "./types.js";

/** Sigue o bloquea un juego para un usuario. Lo usan el comando y los botones de los mensajes. */
export function applyDropsFilter(
  ctx: BotContext,
  guildId: string,
  userId: string,
  mode: "allow" | "block",
  key: string,
  name: string,
): string {
  ctx.repos.filters.set(guildId, userId, key, name, mode);
  if (mode === "allow") {
    const isNew = ctx.repos.subs.subscribe(guildId, userId, "drops");
    return `🔔 Ahora sigues **${name}**: solo te mencionaré por los juegos que sigas.` +
      (isNew ? "\n(Te he suscrito a los avisos de Twitch Drops.)" : "");
  }
  return `🚫 Has bloqueado **${name}**: no te mencionaré por sus drops.`;
}

/** Resuelve el nombre escrito o elegido en el autocompletado a un juego conocido (si lo hay). */
function resolveGame(ctx: BotContext, input: string): { key: string; name: string } {
  const key = gameKey(input);
  const known = ctx.jobs.drops.knownGames().find((g) => g.key === key);
  return known ?? { key, name: input.trim() };
}

export const drops: Command = {
  data: new SlashCommandBuilder()
    .setName("drops")
    .setDescription("Twitch Drops: elegir juegos y ver campañas activas")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName("seguir")
        .setDescription("Avisarme solo de los drops de los juegos que siga")
        .addStringOption((o) => o.setName("juego").setDescription("Nombre del juego").setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("bloquear")
        .setDescription("No avisarme nunca de los drops de este juego")
        .addStringOption((o) => o.setName("juego").setDescription("Nombre del juego").setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) =>
      s
        .setName("quitar")
        .setDescription("Quitar un juego de tus seguidos o bloqueados")
        .addStringOption((o) => o.setName("juego").setDescription("Nombre del juego").setRequired(true).setAutocomplete(true)),
    )
    .addSubcommand((s) => s.setName("filtros").setDescription("Ver tus juegos seguidos y bloqueados"))
    .addSubcommand((s) => s.setName("activos").setDescription("Ver las campañas de drops activas, con filtros y búsqueda")),

  async execute(interaction, ctx) {
    const { guildId, user } = interaction;
    const sub = interaction.options.getSubcommand();

    if (sub === "seguir" || sub === "bloquear") {
      const game = resolveGame(ctx, interaction.options.getString("juego", true));
      const content = applyDropsFilter(ctx, guildId, user.id, sub === "seguir" ? "allow" : "block", game.key, game.name);
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "quitar") {
      const input = interaction.options.getString("juego", true);
      const removed = ctx.repos.filters.remove(guildId, user.id, gameKey(input));
      await interaction.reply({
        content: removed ? `✅ Filtro de **${input}** eliminado.` : `No tenías ningún filtro para **${input}**.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === "filtros") {
      const list = ctx.repos.filters.listForUser(guildId, user.id);
      const allow = list.filter((f) => f.mode === "allow").map((f) => `• ${f.game_name}`);
      const block = list.filter((f) => f.mode === "block").map((f) => `• ${f.game_name}`);
      const subscribed = ctx.repos.subs.listForUser(guildId, user.id).includes("drops");
      const embed = new EmbedBuilder()
        .setColor(COLORS.drops)
        .setTitle("Tus filtros de Twitch Drops")
        .addFields(
          { name: "🔔 Sigues", value: allow.join("\n") || "Ninguno: te aviso de todos los juegos" },
          { name: "🚫 Bloqueados", value: block.join("\n") || "Ninguno" },
        )
        .setFooter({ text: subscribed ? "Estás suscrito a los avisos de drops" : "No estás suscrito: usa /avisos activar" });
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    // activos
    const campaigns = ctx.jobs.drops.cached();
    if (campaigns.length === 0) {
      await interaction.reply({ content: "No conozco campañas de drops activas ahora mismo.", flags: MessageFlags.Ephemeral });
      return;
    }
    const view = buildDropsView(campaigns, ctx.repos.filters.listForUser(guildId, user.id), INITIAL_VIEW);
    await interaction.reply({ ...view, flags: MessageFlags.Ephemeral });
  },

  async autocomplete(interaction, ctx) {
    const focused = gameKey(interaction.options.getFocused());
    const sub = interaction.options.getSubcommand();
    const pool =
      sub === "quitar"
        ? ctx.repos.filters.listForUser(interaction.guildId, interaction.user.id).map((f) => ({ key: f.game_key, name: f.game_name }))
        : ctx.jobs.drops.knownGames();
    const matches = pool
      .filter((g) => !focused || g.key.includes(focused))
      .slice(0, 25)
      .map((g) => ({ name: truncate(g.name, 100), value: truncate(g.name, 100) }));
    await interaction.respond(matches);
  },
};
