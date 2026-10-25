import path from "node:path";
import { ChannelType, Client, EmbedBuilder, Events, GatewayIntentBits, PermissionFlagsBits, type Guild } from "discord.js";
import { handleInteraction, registerCommands } from "./commands/index.js";
import type { BotContext } from "./commands/types.js";
import { loadConfig } from "./config.js";
import type { AppContext } from "./context.js";
import { openDb } from "./db/index.js";
import { createRepos } from "./db/repos/index.js";
import { createJobs } from "./jobs/scheduler.js";
import { logger } from "./logger.js";
import { COLORS } from "./notifier/embeds.js";
import { Publisher } from "./notifier/publisher.js";
import { SunkwiDropsSource } from "./sources/drops/sunkwi.js";

const config = loadConfig();
const db = openDb(path.join(config.DATA_DIR, "bot.sqlite"));
const repos = createRepos(db);

// Solo necesitamos el intent Guilds: los comandos slash no requieren leer mensajes
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const appCtx: AppContext = {
  config,
  client,
  repos,
  publisher: new Publisher(client),
  dropsSource: new SunkwiDropsSource(config.DROPS_API_URL),
};
const ctx: BotContext = { ...appCtx, jobs: createJobs(appCtx) };

client.once(Events.ClientReady, async (c) => {
  logger.info({ user: c.user.tag, guilds: c.guilds.cache.size }, "Bot conectado");
  try {
    await registerCommands(config);
  } catch (err) {
    logger.error({ err }, "No se pudieron registrar los comandos");
  }
  ctx.jobs.start();
});

client.on(Events.InteractionCreate, (interaction) => {
  void handleInteraction(interaction, ctx);
});

client.on(Events.GuildCreate, (guild) => {
  logger.info({ guild: guild.name, id: guild.id }, "Añadido a un servidor");
  repos.guilds.ensure(guild.id);
  void sendWelcome(guild);
});

client.on(Events.GuildDelete, (guild) => {
  logger.info({ id: guild.id }, "Eliminado de un servidor");
  repos.guilds.remove(guild.id);
});

client.on(Events.Error, (err) => logger.error({ err }, "Error del cliente de Discord"));

async function sendWelcome(guild: Guild): Promise<void> {
  const me = guild.members.me;
  if (!me) return;
  const textChannels = guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).values();
  const channel = [guild.systemChannel, ...textChannels].find(
    (c) =>
      c?.type === ChannelType.GuildText &&
      c.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]),
  );
  if (channel?.type !== ChannelType.GuildText) return;

  const embed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle("👋 ¡Hola! Soy el bot de noticias gaming")
    .setDescription(
      [
        "Aviso de **juegos gratis de Epic**, **Twitch Drops** nuevos y **Pick'em** de esports con recompensas.",
        "",
        "**Admins:** elegid el canal con `/config canal canal:#noticias`.",
        "**Todos:** `/avisos activar categoria:Todas` para que os mencione en cada noticia.",
        "",
        "Toda la documentación: `/ayuda`",
      ].join("\n"),
    );
  await channel.send({ embeds: [embed] }).catch((err: unknown) => logger.warn({ err: String(err) }, "No se pudo enviar la bienvenida"));
}

function shutdown(signal: string) {
  logger.info({ signal }, "Cerrando...");
  ctx.jobs.stop();
  void client.destroy().finally(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (err) => logger.error({ err }, "Promesa rechazada sin capturar"));

await client.login(config.DISCORD_TOKEN);
