import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import type { BotContext } from "../commands/types.js";
import type { DropsFilter } from "../db/repos/dropsFilters.js";
import { COLORS, truncate } from "../notifier/embeds.js";
import { twitchGameUrl, type DropCampaign } from "../sources/drops/types.js";
import { discordTs } from "../time.js";
import { gameKey } from "../types.js";

/**
 * Vista interactiva de /drops activos: desplegable de filtro, búsqueda por nombre y páginas.
 * El estado viaja en el customId de cada componente (dv:acción:modo:página:búsqueda), así que
 * sigue funcionando tras un reinicio del bot.
 */
export const DROPS_VIEW_PREFIX = "dv";
export const PAGE_SIZE = 15;
const MAX_QUERY = 50;
const QUERY_INPUT = "q";

const MODES = {
  t: { label: "Todos los juegos", emoji: "🪂" },
  s: { label: "Solo los que sigo", emoji: "🔔" },
  b: { label: "Ocultar los bloqueados", emoji: "🚫" },
} as const;
export type ViewMode = keyof typeof MODES;

const isMode = (v: string | undefined): v is ViewMode => !!v && v in MODES;

export interface ViewState {
  mode: ViewMode;
  page: number;
  query: string;
}

export const INITIAL_VIEW: ViewState = { mode: "t", page: 0, query: "" };

export function encodeViewId(action: string, s: ViewState): string {
  return `${DROPS_VIEW_PREFIX}:${action}:${s.mode}:${s.page}:${s.query}`;
}

export function decodeViewId(customId: string): { action: string; state: ViewState } | null {
  const [prefix, action, mode, page, ...query] = customId.split(":");
  if (prefix !== DROPS_VIEW_PREFIX || !action || !isMode(mode)) return null;
  // La búsqueda puede contener ":"
  return { action, state: { mode, page: Number(page) || 0, query: query.join(":") } };
}

export interface GameRow {
  key: string;
  name: string;
  campaigns: number;
  startAt: number;
  endAt: number;
  filter: DropsFilter["mode"] | null;
}

/** Un juego por fila, con el filtro del usuario, aplicando el modo y la búsqueda; ordenados por nombre. */
export function gameRows(campaigns: DropCampaign[], filters: DropsFilter[], view: Pick<ViewState, "mode" | "query">): GameRow[] {
  const byKey = new Map(filters.map((f) => [f.game_key, f.mode]));
  const query = gameKey(view.query);
  return [...Map.groupBy(campaigns, (c) => c.gameKey)]
    .map(([key, list]) => ({
      key,
      name: list[0]!.gameName,
      campaigns: list.length,
      startAt: Math.min(...list.map((c) => new Date(c.startAt).getTime())),
      endAt: Math.max(...list.map((c) => new Date(c.endAt).getTime())),
      filter: byKey.get(key) ?? null,
    }))
    .filter((g) => (view.mode === "s" ? g.filter === "allow" : view.mode === "b" ? g.filter !== "block" : true))
    .filter((g) => !query || g.key.includes(query))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function gameLine(g: GameRow, now: number): string {
  const mark = g.filter === "allow" ? "🔔" : g.filter === "block" ? "🚫" : "•";
  const name = g.name.replace(/[[\]]/g, "");
  const when = g.startAt > now ? `empieza ${discordTs(g.startAt, "R")}` : `hasta ${discordTs(g.endAt, "d")}`;
  return `${mark} **[${name}](${twitchGameUrl(g.name)})** · ${g.campaigns} campaña${g.campaigns > 1 ? "s" : ""} · ${when}`;
}

function emptyText(view: ViewState, filters: DropsFilter[]): string {
  if (view.mode === "s" && !filters.some((f) => f.mode === "allow")) {
    return "No sigues ningún juego. Usa `/drops seguir` o el botón 🔔 de los avisos de drops.";
  }
  return view.query ? `Ningún juego coincide con «${view.query}».` : "No hay campañas que mostrar con este filtro.";
}

export function buildDropsView(campaigns: DropCampaign[], filters: DropsFilter[], view: ViewState, now = Date.now()) {
  const total = new Set(campaigns.map((c) => c.gameKey)).size;
  const rows = gameRows(campaigns, filters, view);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const s: ViewState = { ...view, page: Math.min(Math.max(view.page, 0), pages - 1) };
  const visible = rows.slice(s.page * PAGE_SIZE, (s.page + 1) * PAGE_SIZE);

  const header = s.query ? `🔍 Buscando «${s.query}»\n\n` : "";
  const body = visible.length ? visible.map((g) => gameLine(g, now)).join("\n") : emptyText(s, filters);
  const embed = new EmbedBuilder()
    .setColor(COLORS.drops)
    .setTitle(`🪂 Drops activos: ${rows.length === total ? total : `${rows.length} de ${total}`} juegos`)
    .setDescription(truncate(header + body, 4000))
    .setFooter({ text: `Página ${s.page + 1}/${pages} · 🔔 sigues · 🚫 bloqueado · /drops seguir o /drops bloquear` });

  const select = new StringSelectMenuBuilder()
    .setCustomId(encodeViewId("modo", s))
    .setPlaceholder("Mostrar…")
    .addOptions(
      Object.entries(MODES).map(([value, m]) => ({ label: m.label, value, emoji: m.emoji, default: value === s.mode })),
    );
  const buttons = [
    new ButtonBuilder().setCustomId(encodeViewId("prev", s)).setEmoji("◀️").setStyle(ButtonStyle.Secondary).setDisabled(s.page === 0),
    new ButtonBuilder().setCustomId(encodeViewId("next", s)).setEmoji("▶️").setStyle(ButtonStyle.Secondary).setDisabled(s.page >= pages - 1),
    new ButtonBuilder().setCustomId(encodeViewId("buscar", s)).setEmoji("🔍").setLabel("Buscar por nombre").setStyle(ButtonStyle.Primary),
  ];
  if (s.query) {
    buttons.push(new ButtonBuilder().setCustomId(encodeViewId("limpiar", s)).setEmoji("✖️").setLabel("Quitar búsqueda").setStyle(ButtonStyle.Secondary));
  }

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select),
      new ActionRowBuilder<ButtonBuilder>().addComponents(buttons),
    ],
  };
}

function searchModal(view: ViewState): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId(QUERY_INPUT)
    .setStyle(TextInputStyle.Short)
    .setMaxLength(MAX_QUERY)
    .setPlaceholder("p. ej. marvel");
  if (view.query) input.setValue(view.query);
  return new ModalBuilder()
    .setCustomId(encodeViewId("modal", view))
    .setTitle("Buscar drops por nombre")
    .addLabelComponents(new LabelBuilder().setLabel("Nombre del juego (o parte)").setTextInputComponent(input));
}

type ViewInteraction = ButtonInteraction<"cached"> | StringSelectMenuInteraction<"cached"> | ModalSubmitInteraction<"cached">;

export async function handleDropsView(interaction: ViewInteraction, ctx: BotContext): Promise<void> {
  const parsed = decodeViewId(interaction.customId);
  if (!parsed) return;
  const { action, state } = parsed;
  // Se recalcula con los datos y filtros actuales: pueden haber cambiado desde que se abrió la vista
  const render = (view: ViewState) =>
    buildDropsView(ctx.jobs.drops.cached(), ctx.repos.filters.listForUser(interaction.guildId, interaction.user.id), view);

  if (interaction.isStringSelectMenu()) {
    const mode = interaction.values[0];
    await interaction.update(render({ ...state, mode: isMode(mode) ? mode : state.mode, page: 0 }));
  } else if (interaction.isButton()) {
    if (action === "buscar") {
      await interaction.showModal(searchModal(state));
      return;
    }
    const page = action === "prev" ? state.page - 1 : action === "next" ? state.page + 1 : 0;
    await interaction.update(render(action === "limpiar" ? { ...state, query: "", page } : { ...state, page }));
  } else if (interaction.isFromMessage()) {
    const query = interaction.fields.getTextInputValue(QUERY_INPUT).trim().slice(0, MAX_QUERY);
    await interaction.update(render({ ...state, query, page: 0 }));
  }
}
