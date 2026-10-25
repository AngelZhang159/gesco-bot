import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { COLORS } from "../notifier/embeds.js";
import type { Command } from "./types.js";

const TOPICS = {
  inicio: {
    title: "📰 Bot de noticias gaming",
    body: [
      "Publico en este servidor:",
      "• 🎮 **Juegos gratis de Epic Games**: un mensaje cada semana con todos los juegos y hasta cuándo se pueden reclamar.",
      "• 🪂 **Twitch Drops nuevos**: un mensaje por juego con las recompensas y las fechas.",
      "• 🏆 **Pick'em de esports** (LoL, Valorant, Marvel Rivals, CS2...): un mensaje por pick'em con su fecha límite y un recordatorio el último día.",
      "",
      "**Empieza en 10 segundos:** `/avisos activar categoria:Todas` y te mencionaré en cada noticia.",
      "",
      "Más ayuda: `/ayuda tema:` → *Avisos*, *Drops*, *Pick'em*, *Epic* o *Administración*.",
    ],
  },
  avisos: {
    title: "🔔 Avisos (menciones)",
    body: [
      "Las noticias se publican siempre en el canal del servidor. Si te suscribes, además **te menciono** para que te llegue la notificación.",
      "",
      "`/avisos activar categoria:<Epic | Drops | Pick'em | Todas>` → suscribirte",
      "`/avisos desactivar categoria:<...>` → darte de baja",
      "`/avisos ver` → ver tus suscripciones y filtros",
      "",
      "*Ejemplo:* `/avisos activar categoria:Pick'em`",
    ],
  },
  drops: {
    title: "🪂 Twitch Drops",
    body: [
      "Cada vez que aparece una campaña de drops nueva publico un mensaje por juego.",
      "Puedes elegir de qué juegos quieres que te avise:",
      "",
      "`/drops seguir juego:<nombre>` → solo te aviso de los juegos que sigas (te suscribe a Drops automáticamente)",
      "`/drops bloquear juego:<nombre>` → nunca te aviso de ese juego",
      "`/drops quitar juego:<nombre>` → elimina ese filtro",
      "`/drops filtros` → ver tus filtros",
      "`/drops activos` → campañas activas, con un desplegable para ver solo las que sigues y búsqueda por nombre",
      "",
      "**Reglas:** si no sigues ningún juego, te aviso de todos menos los bloqueados. Si sigues alguno, solo de esos.",
      "También puedes usar los botones **🔔 Seguir** / **🚫 Bloquear** de cada mensaje de drops.",
      "El nombre del juego se autocompleta con los juegos que tienen drops ahora.",
    ],
  },
  pickem: {
    title: "🏆 Pick'em",
    body: [
      "Busco automáticamente en noticias los pick'em con recompensas de LoL (Worlds/MSI), Valorant, Marvel Rivals, CS2, Rainbow Six y Overwatch.",
      "",
      "• Cada pick'em es un mensaje distinto con su **fecha límite** (si la noticia la indica).",
      "• El **último día** (a las 09:00) envío un recordatorio mencionando a los suscritos.",
      "• Si la fuente solo dice el día, la hora es aproximada: revisa el enlace.",
      "",
      "`/pickem activos` → lista de pick'em abiertos y su cierre",
      "`/pickem descartar id:<ID>` → (admins) borra un aviso erróneo; el ID aparece al pie del mensaje",
    ],
  },
  epic: {
    title: "🎮 Juegos gratis de Epic",
    body: [
      "Epic regala juegos cada semana (normalmente cambian los jueves a las 17:00). Publico un único mensaje con todos ellos, su fecha límite para reclamarlos y los próximos.",
      "",
      "`/epic` → ver ahora los juegos gratis de esta semana",
    ],
  },
  admin: {
    title: "🛠️ Administración (requiere *Gestionar servidor*)",
    body: [
      "`/config canal canal:#noticias` → canal donde publico todo",
      "`/config canal canal:#drops categoria:Twitch Drops` → canal específico para una categoría",
      "`/config quitar-canal categoria:<...>` → la categoría vuelve al canal general",
      "`/config activar|desactivar categoria:<...>` → activar o desactivar una categoría en el servidor",
      "`/config ver` → configuración actual",
      "`/config forzar categoria:<...>` → consultar la fuente ya y publicar (útil para probar)",
      "",
      "Necesito los permisos **Ver canal**, **Enviar mensajes** e **Insertar enlaces** en el canal elegido.",
      "La primera vez no publico los drops que ya existían, para no llenar el canal: solo los nuevos.",
    ],
  },
} as const;

type Topic = keyof typeof TOPICS;

export const ayuda: Command = {
  data: new SlashCommandBuilder()
    .setName("ayuda")
    .setDescription("Cómo usar el bot: avisos, drops, pick'em y configuración")
    .addStringOption((o) =>
      o
        .setName("tema")
        .setDescription("Tema concreto")
        .addChoices(
          { name: "Inicio", value: "inicio" },
          { name: "Avisos (menciones)", value: "avisos" },
          { name: "Twitch Drops", value: "drops" },
          { name: "Pick'em", value: "pickem" },
          { name: "Epic Games", value: "epic" },
          { name: "Administración", value: "admin" },
        ),
    ),

  async execute(interaction) {
    const topic = (interaction.options.getString("tema") ?? "inicio") as Topic;
    const embeds =
      topic === "inicio"
        ? [toEmbed("inicio"), toEmbed("avisos"), toEmbed("drops"), toEmbed("pickem"), toEmbed("epic"), toEmbed("admin")]
        : [toEmbed(topic)];
    await interaction.reply({ embeds, flags: MessageFlags.Ephemeral });
  },
};

function toEmbed(topic: Topic): EmbedBuilder {
  const t = TOPICS[topic];
  return new EmbedBuilder().setColor(COLORS.info).setTitle(t.title).setDescription(t.body.join("\n"));
}
