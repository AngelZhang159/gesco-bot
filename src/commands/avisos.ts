import { EmbedBuilder, InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { channelFor } from "../db/repos/guilds.js";
import { COLORS } from "../notifier/embeds.js";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "../types.js";
import { categoryChoices, parseCategory, type Command } from "./types.js";

const choices = [...categoryChoices, { name: "Todas", value: "todas" }];

function selected(value: string): Category[] {
  return value === "todas" ? [...CATEGORIES] : [parseCategory(value)];
}

export const avisos: Command = {
  data: new SlashCommandBuilder()
    .setName("avisos")
    .setDescription("Elegir de qué noticias quieres que te mencione")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName("activar")
        .setDescription("Quiero que me menciones en estas noticias")
        .addStringOption((o) => o.setName("categoria").setDescription("Qué noticias").setRequired(true).addChoices(...choices)),
    )
    .addSubcommand((s) =>
      s
        .setName("desactivar")
        .setDescription("No quiero más menciones de estas noticias")
        .addStringOption((o) => o.setName("categoria").setDescription("Qué noticias").setRequired(true).addChoices(...choices)),
    )
    .addSubcommand((s) => s.setName("ver").setDescription("Ver tus suscripciones y filtros")),

  async execute(interaction, ctx) {
    const { subs, filters, guilds } = ctx.repos;
    const { guildId, user } = interaction;
    const sub = interaction.options.getSubcommand();

    if (sub === "activar" || sub === "desactivar") {
      const cats = selected(interaction.options.getString("categoria", true));
      for (const c of cats) {
        if (sub === "activar") subs.subscribe(guildId, user.id, c);
        else subs.unsubscribe(guildId, user.id, c);
      }
      const names = cats.map((c) => `**${CATEGORY_LABELS[c]}**`).join(", ");
      let content =
        sub === "activar"
          ? `🔔 Listo: te mencionaré en ${names}.`
          : `🔕 Listo: ya no te mencionaré en ${names}.`;
      if (sub === "activar" && cats.includes("drops")) {
        content += "\nConsejo: con `/drops seguir` o `/drops bloquear` eliges de qué juegos te aviso.";
      }
      const cfg = guilds.get(guildId);
      if (sub === "activar" && (!cfg || cats.every((c) => !channelFor(cfg, c)))) {
        content += "\n⚠️ Este servidor aún no tiene canal de noticias: un admin debe usar `/config canal`.";
      }
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      return;
    }

    // ver
    const mine = new Set(subs.listForUser(guildId, user.id));
    const myFilters = filters.listForUser(guildId, user.id);
    const allow = myFilters.filter((f) => f.mode === "allow").map((f) => f.game_name);
    const block = myFilters.filter((f) => f.mode === "block").map((f) => f.game_name);
    const lines = CATEGORIES.map((c) => `${mine.has(c) ? "🔔" : "🔕"} ${CATEGORY_LABELS[c]}`);
    lines.push(
      "",
      `**Drops — juegos que sigues:** ${allow.length ? allow.join(", ") : "ninguno (te aviso de todos)"}`,
      `**Drops — juegos bloqueados:** ${block.length ? block.join(", ") : "ninguno"}`,
    );
    const embed = new EmbedBuilder().setColor(COLORS.info).setTitle("Tus avisos").setDescription(lines.join("\n"));
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
