import { DiscordAPIError, RESTJSONErrorCodes, type Client, type Message } from "discord.js";
import { logger } from "../logger.js";
import type { OutgoingMessage } from "./embeds.js";
import { mentionChunks, mentionedIds } from "./mentions.js";

export interface PublishedRef {
  channelId: string;
  messageId: string;
  url: string;
}

const IGNORABLE = new Set<number>([
  RESTJSONErrorCodes.UnknownChannel,
  RESTJSONErrorCodes.UnknownMessage,
  RESTJSONErrorCodes.MissingAccess,
  RESTJSONErrorCodes.MissingPermissions,
]);

function isIgnorable(err: unknown): boolean {
  return err instanceof DiscordAPIError && typeof err.code === "number" && IGNORABLE.has(err.code);
}

export class Publisher {
  constructor(private readonly client: Client) {}

  private async sendableChannel(channelId: string) {
    const channel = await this.client.channels.fetch(channelId).catch((err: unknown) => {
      if (isIgnorable(err)) return null;
      throw err;
    });
    return channel?.isSendable() ? channel : null;
  }

  /**
   * Envía el mensaje mencionando a los usuarios. Si las menciones no caben, van en mensajes de seguimiento.
   * Devuelve null si el canal ya no existe o el bot no tiene permisos (se registra y se sigue).
   */
  async publish(channelId: string, msg: OutgoingMessage, mentionUserIds: string[] = []): Promise<PublishedRef | null> {
    try {
      const channel = await this.sendableChannel(channelId);
      if (!channel) {
        logger.warn({ channelId }, "Canal no disponible para publicar");
        return null;
      }
      const [first, ...rest] = mentionChunks(msg.content, mentionUserIds);
      const main: Message = await channel.send({
        content: first,
        embeds: msg.embeds,
        components: msg.components ?? [],
        allowedMentions: { parse: [], users: mentionedIds(first!) },
      });
      for (const chunk of rest) {
        await channel.send({ content: chunk, allowedMentions: { parse: [], users: mentionedIds(chunk) } });
      }
      return { channelId, messageId: main.id, url: main.url };
    } catch (err) {
      if (isIgnorable(err)) {
        logger.warn({ channelId, err: String(err) }, "Sin permisos o canal inexistente");
        return null;
      }
      throw err;
    }
  }

  /** Actualiza los embeds de un mensaje ya publicado (editar no vuelve a notificar a nadie). */
  async editEmbeds(channelId: string, messageId: string, msg: OutgoingMessage): Promise<boolean> {
    try {
      const channel = await this.sendableChannel(channelId);
      if (!channel) return false;
      // Editar directamente (sin fetch) no requiere el permiso "Leer historial de mensajes"
      await channel.messages.edit(messageId, { embeds: msg.embeds });
      return true;
    } catch (err) {
      if (isIgnorable(err)) return false;
      throw err;
    }
  }

  async delete(channelId: string, messageId: string): Promise<boolean> {
    try {
      const channel = await this.sendableChannel(channelId);
      if (!channel) return false;
      await channel.messages.delete(messageId);
      return true;
    } catch (err) {
      if (isIgnorable(err)) return false;
      throw err;
    }
  }

  messageUrl(guildId: string, channelId: string, messageId: string): string {
    return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
  }
}
