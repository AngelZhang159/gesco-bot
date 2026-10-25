import {
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type GuildBasedChannel,
} from "discord.js";
import { channelFor } from "../db/repos/guilds.js";
import { COLORS } from "../notifier/embeds.js";
import { CATEGORIES, CATEGORY_LABELS } from "../types.js";
import { categoryChoices, parseCategory, type Command } from "./types.js";

const REQUIRED = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];

export const config: Command = {
  data: new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configurar el bot en este servidor (admins)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName("canal")
        .setDescription("Elegir el canal donde publico las noticias")
        .addChannelOption((o) =>
          o
            .setName("canal")
            .setDescription("Canal de texto o de anuncios")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o.setName("categoria").setDescription("Solo para esta categoría (vacío = canal general)").addChoices(...categoryChoices),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("quitar-canal")
        .setDescription("Quitar el canal específico de una categoría (vuelve al general)")
        .addStringOption((o) => o.setName("categoria").setDescription("Categoría").setRequired(true).addChoices(...categoryChoices)),
    )
    .addSubcommand((s) =>
      s
        .setName("activar")
        .setDescription("Activar una categoría de noticias")
        .addStringOption((o) => o.setName("categoria").setDescription("Categoría").setRequired(true).addChoices(...categoryChoices)),
    )
    .addSubcommand((s) =>
      s
        .setName("desactivar")
        .setDescription("Desactivar una categoría de noticias")
        .addStringOption((o) => o.setName("categoria").setDescription("Categoría").setRequired(true).addChoices(...categoryChoices)),
    )
    .addSubcommand((s) => s.setName("ver").setDescription("Ver la configuración actual"))
    .addSubcommand((s) =>
      s
        .setName("forzar")
        .setDescription("Consultar ya una fuente y publicar (para probar)")
        .addStringOption((o) => o.setName("categoria").setDescription("Categoría").setRequired(true).addChoices(...categoryChoices)),
    ),

  async execute(interaction, ctx) {
    const { guilds } = ctx.repos;
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === "canal") {
      const channel = interaction.options.getChannel("canal", true) as GuildBasedChannel;
      const catValue = interaction.options.getString("categoria");
      const category = catValue ? parseCategory(catValue) : null;

      const me = interaction.guild.members.me;
      const perms = me && channel.permissionsFor(me);
      if (!perms || !REQUIRED.every((p) => perms.has(p))) {
        await interaction.reply({
          content: `❌ No tengo permisos en ${channel}. Necesito **Ver canal**, **Enviar mensajes** e **Insertar enlaces**.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const before = guilds.get(guildId);
      guilds.setChannel(guildId, category, channel.id);
      const target = category ? `las noticias de **${CATEGORY_LABELS[category]}**` : "todas las noticias";
      const firstTime = !before || !CATEGORIES.some((c) => channelFor(before, c));
      await interaction.reply({
        content:
          `✅ Publicaré ${target} en ${channel}.` +
          (firstTime
            ? "\nLos juegos gratis de Epic y los pick'em activos llegarán en unos minutos. Usa `/config forzar` para probar ya."
            : ""),
      });
      return;
    }

    if (sub === "quitar-canal") {
      const category = parseCategory(interaction.options.getString("categoria", true));
      guilds.setChannel(guildId, category, null);
      await interaction.reply({ content: `✅ **${CATEGORY_LABELS[category]}** usará el canal general.` });
      return;
    }

    if (sub === "activar" || sub === "desactivar") {
      const category = parseCategory(interaction.options.getString("categoria", true));
      guilds.setEnabled(guildId, category, sub === "activar");
      await interaction.reply({
        content: `✅ **${CATEGORY_LABELS[category]}** ${sub === "activar" ? "activado" : "desactivado"} en este servidor.`,
      });
      return;
    }

    if (sub === "ver") {
      const cfg = guilds.ensure(guildId);
      const lines = CATEGORIES.map((c) => {
        const on = cfg[`${c}_on`] === 1;
        const channel = channelFor(cfg, c);
        const status = !on ? "⏸️ desactivado" : channel ? `<#${channel}>` : "⚠️ sin canal";
        return `**${CATEGORY_LABELS[c]}:** ${status}`;
      });
      const embed = new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle("⚙️ Configuración")
        .setDescription(
          [`**Canal general:** ${cfg.channel_id ? `<#${cfg.channel_id}>` : "sin configurar"}`, ...lines, `**Zona horaria:** ${cfg.tz}`].join("\n"),
        );
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "forzar") {
      const category = parseCategory(interaction.options.getString("categoria", true));
      const cfg = guilds.get(guildId);
      if (!cfg || !channelFor(cfg, category)) {
        await interaction.reply({
          content: "❌ Esa categoría no tiene canal o está desactivada. Usa `/config canal` primero.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await ctx.jobs.forceForGuild(category, guildId);
      await interaction.editReply(`🔄 ${CATEGORY_LABELS[category]}: ${result}`);
    }
  },
};
