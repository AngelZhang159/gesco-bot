import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { epicMessage } from "../notifier/embeds.js";
import type { Command } from "./types.js";

export const epic: Command = {
  data: new SlashCommandBuilder().setName("epic").setDescription("Ver los juegos gratis de esta semana en Epic Games"),

  async execute(interaction, ctx) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const data = await ctx.jobs.epic.current();
    if (!data) {
      await interaction.editReply("No he podido contactar con Epic Games. Prueba en unos minutos.");
      return;
    }
    const msg = epicMessage(data);
    await interaction.editReply({ content: msg.content, embeds: msg.embeds });
  },
};
