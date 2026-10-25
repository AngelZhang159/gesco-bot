import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import type { Pickem } from "../db/repos/pickems.js";
import type { DropCampaign } from "../sources/drops/types.js";
import type { EpicFreeGames, FreeGame } from "../sources/epic.js";
import { discordTs } from "../time.js";

export interface OutgoingMessage {
  content: string;
  embeds: EmbedBuilder[];
  components?: ActionRowBuilder<ButtonBuilder>[];
}

export const COLORS = {
  epic: 0x0078f2,
  drops: 0x9146ff,
  pickem: 0xf1c40f,
  reminder: 0xe67e22,
  info: 0x5865f2,
  ok: 0x57f287,
  error: 0xed4245,
} as const;

export const truncate = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

const until = (ms: number | string) => `${discordTs(ms, "F")} (${discordTs(ms, "R")})`;

// ---------- Epic ----------

export function epicMessage(data: EpicFreeGames): OutgoingMessage {
  const maxCurrent = data.upcoming.length > 0 ? 9 : 10;
  const embeds = data.current.slice(0, maxCurrent).map(epicGameEmbed);

  if (data.upcoming.length > 0) {
    const lines = data.upcoming.map(
      (g) => `**[${g.mystery ? "🎁 Juego misterioso" : g.title}](${g.url})** — del ${discordTs(g.startAt, "d")} al ${discordTs(g.endAt, "d")}`,
    );
    embeds.push(
      new EmbedBuilder()
        .setColor(0x4f545c)
        .setTitle("📅 Próximamente gratis")
        .setDescription(truncate(lines.join("\n"), 4000)),
    );
  }

  const content =
    data.current.length > 0
      ? `🎮 **Juegos gratis esta semana en Epic Games Store** (${data.current.length})`
      : "🎮 Ahora mismo no hay juegos gratis en Epic Games Store.";
  return { content, embeds };
}

function epicGameEmbed(g: FreeGame): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COLORS.epic)
    .setTitle(truncate(g.mystery ? "🎁 Juego misterioso" : g.title, 256))
    .setURL(g.url)
    .addFields({ name: "⏳ Gratis hasta", value: until(g.endAt) });
  if (g.mystery) embed.setDescription("Se revela cuando empieza la promoción.");
  else if (g.description) embed.setDescription(truncate(g.description, 250));
  if (g.originalPrice && !/^0([.,]0+)?\s?€?$/.test(g.originalPrice)) {
    embed.addFields({ name: "💰 Precio habitual", value: g.originalPrice, inline: true });
  }
  if (g.image) embed.setImage(g.image);
  return embed;
}

// ---------- Twitch Drops ----------

export const DROPS_BUTTON_PREFIX = "drops";
const MAX_CUSTOM_ID_KEY = 100 - `${DROPS_BUTTON_PREFIX}:block:`.length;

export function dropsButtonId(action: "allow" | "block", gameKey: string): string {
  return `${DROPS_BUTTON_PREFIX}:${action}:${gameKey.slice(0, MAX_CUSTOM_ID_KEY)}`;
}

export function dropsMessage(gameName: string, gameKey: string, campaigns: DropCampaign[], now = Date.now()): OutgoingMessage {
  const embeds = campaigns.slice(0, 10).map((c) => dropsCampaignEmbed(c, now));
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(dropsButtonId("allow", gameKey))
      .setStyle(ButtonStyle.Success)
      .setEmoji("🔔")
      .setLabel(truncate(`Seguir ${gameName}`, 80)),
    new ButtonBuilder()
      .setCustomId(dropsButtonId("block", gameKey))
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🚫")
      .setLabel(truncate(`Bloquear ${gameName}`, 80)),
  );
  return { content: `🪂 **Nuevos Twitch Drops de ${gameName}**`, embeds, components: [row] };
}

export function dropsCampaignEmbed(c: DropCampaign, now = Date.now()): EmbedBuilder {
  const rewards = c.rewards.map((r) => `• **${r.name}**${r.minutes ? ` — ${formatMinutes(r.minutes)} viendo` : ""}`);
  const start = new Date(c.startAt).getTime();
  const when =
    `Del ${discordTs(c.startAt, "f")} al ${discordTs(c.endAt, "f")}\n` +
    (start > now ? `▶️ Empieza ${discordTs(c.startAt, "R")}` : `⏳ Termina ${discordTs(c.endAt, "R")}`);

  const embed = new EmbedBuilder()
    .setColor(COLORS.drops)
    .setAuthor({ name: c.gameName })
    .setTitle(truncate(c.name, 256))
    .setURL(c.url)
    .setDescription(rewards.length ? truncate(rewards.join("\n"), 4000) : "Recompensas no detalladas por la fuente.")
    .addFields({ name: "🗓️ Disponible", value: when });
  if (c.accountLinkUrl) embed.addFields({ name: "🔗 Requiere vincular cuenta", value: `[Vincular aquí](${c.accountLinkUrl})` });
  if (c.boxArt) embed.setThumbnail(c.boxArt);
  return embed;
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

// ---------- Pick'em ----------

function deadlineValue(p: Pickem): string {
  if (p.deadline_at === null) return "No indicada en la fuente: revisa el enlace.";
  const approx = p.deadline_confidence === "baja" ? "\n*Hora aproximada: la fuente solo indica el día.*" : "";
  return `${until(p.deadline_at)}${approx}`;
}

export function pickemMessage(p: Pickem): OutgoingMessage {
  const embed = new EmbedBuilder()
    .setColor(COLORS.pickem)
    .setTitle(truncate(`🏆 Pick'em de ${p.game_name}`, 256))
    .setURL(p.url)
    .setDescription(
      `Haz tus predicciones antes del cierre para conseguir las recompensas.\n\n📰 **Fuente:** [${truncate(p.title, 200)}](${p.url})`,
    )
    .addFields({ name: "⏰ Fecha límite", value: deadlineValue(p) })
    .setFooter({ text: `ID ${p.id} · Detectado automáticamente en noticias` });
  if (p.deadline_at !== null) embed.addFields({ name: "🔔 Recordatorio", value: "Avisaré el último día." });
  return { content: `🏆 **Nuevo Pick'em: ${p.game_name}**`, embeds: [embed] };
}

export function pickemReminderMessage(p: Pickem, originalUrl: string | null): OutgoingMessage {
  const embed = new EmbedBuilder()
    .setColor(COLORS.reminder)
    .setTitle(truncate(`🏆 Pick'em de ${p.game_name}`, 256))
    .setURL(p.url)
    .setDescription(`📰 [${truncate(p.title, 200)}](${p.url})`)
    .addFields({ name: "⏰ Cierra", value: deadlineValue(p) });
  if (originalUrl) embed.addFields({ name: "📌 Publicación original", value: `[Ver mensaje](${originalUrl})` });
  return { content: `⏰ **¡Último día para el Pick'em de ${p.game_name}!**`, embeds: [embed] };
}
