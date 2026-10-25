import { EmbedBuilder, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { COLORS, truncate } from "../notifier/embeds.js";
import { discordTs } from "../time.js";
import type { Command } from "./types.js";

export const pickem: Command = {
  data: new SlashCommandBuilder()
    .setName("pickem")
    .setDescription("Pick'em de esports con recompensas")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName("activos").setDescription("Ver los pick'em abiertos y su fecha límite"))
    .addSubcommand((s) =>
      s
        .setName("descartar")
        .setDescription("(Admins) Borrar un pick'em detectado por error")
        .addIntegerOption((o) => o.setName("id").setDescription("ID que aparece al pie del mensaje").setRequired(true).setMinValue(1)),
    ),

  async execute(interaction, ctx) {
    const sub = interaction.options.getSubcommand();

    if (sub === "descartar") {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: "❌ Necesitas el permiso **Gestionar servidor**.", flags: MessageFlags.Ephemeral });
        return;
      }
      const id = interaction.options.getInteger("id", true);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const ok = await ctx.jobs.pickem.discard(id);
      await interaction.editReply(
        ok ? `🗑️ Pick'em ${id} descartado: he borrado sus mensajes y no enviaré recordatorio.` : `No hay ningún pick'em activo con ID ${id}.`,
      );
      return;
    }

    const active = ctx.jobs.pickem.active();
    if (active.length === 0) {
      await interaction.reply({ content: "No hay pick'em abiertos ahora mismo.", flags: MessageFlags.Ephemeral });
      return;
    }
    const lines = active.map((p) => {
      const when =
        p.deadline_at === null
          ? "fecha límite no indicada"
          : `cierra ${discordTs(p.deadline_at, "f")} (${discordTs(p.deadline_at, "R")})${p.deadline_confidence === "baja" ? " · aprox." : ""}`;
      return `**${p.game_name}** — [${truncate(p.title, 90)}](${p.url})\n  ${when} · ID ${p.id}`;
    });
    const embed = new EmbedBuilder()
      .setColor(COLORS.pickem)
      .setTitle(`🏆 Pick'em abiertos (${active.length})`)
      .setDescription(truncate(lines.join("\n"), 4000));
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
