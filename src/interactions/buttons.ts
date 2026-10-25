import { MessageFlags, type ButtonInteraction } from "discord.js";
import { applyDropsFilter } from "../commands/drops.js";
import type { BotContext } from "../commands/types.js";
import { DROPS_BUTTON_PREFIX } from "../notifier/embeds.js";

/** Botones "Seguir" / "Bloquear" de los mensajes de drops: customId = drops:<allow|block>:<gameKey>. */
export async function handleButton(interaction: ButtonInteraction<"cached">, ctx: BotContext): Promise<void> {
  const [prefix, action, ...rest] = interaction.customId.split(":");
  if (prefix !== DROPS_BUTTON_PREFIX || (action !== "allow" && action !== "block")) return;

  const keyFromButton = rest.join(":");
  // El customId puede venir recortado: buscamos el juego completo entre los conocidos
  const known = ctx.jobs.drops.knownGames().find((g) => g.key === keyFromButton || g.key.startsWith(keyFromButton));
  const name = known?.name ?? interaction.message.embeds[0]?.author?.name ?? keyFromButton;
  const key = known?.key ?? keyFromButton;

  const content = applyDropsFilter(ctx, interaction.guildId, interaction.user.id, action, key, name);
  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}
