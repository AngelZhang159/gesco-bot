import type { DropsFilter } from "../db/repos/dropsFilters.js";

export const DISCORD_MAX_CONTENT = 2000;

/**
 * Usuarios suscritos a drops a los que mencionar por un juego:
 * - si tienen el juego bloqueado, no;
 * - si siguen algún juego (lista "allow"), solo por esos;
 * - si no tienen filtros, por todos.
 */
export function dropsRecipients(subscribed: string[], filters: DropsFilter[], gameKey: string): string[] {
  const allow = new Map<string, Set<string>>();
  const block = new Map<string, Set<string>>();
  for (const f of filters) {
    const map = f.mode === "allow" ? allow : block;
    if (!map.has(f.user_id)) map.set(f.user_id, new Set());
    map.get(f.user_id)!.add(f.game_key);
  }
  return subscribed.filter((user) => {
    if (block.get(user)?.has(gameKey)) return false;
    const allowed = allow.get(user);
    return !allowed || allowed.size === 0 || allowed.has(gameKey);
  });
}

/**
 * Reparte las menciones para no pasar del límite de caracteres de Discord.
 * El primer trozo se añade a `header` (el texto del mensaje principal); el resto van en mensajes aparte.
 */
export function mentionChunks(header: string, userIds: string[], limit = DISCORD_MAX_CONTENT): string[] {
  const chunks: string[] = [];
  let current = header;
  let currentHasMentions = false;

  for (const id of userIds) {
    const mention = `<@${id}>`;
    const sep = currentHasMentions ? " " : current ? "\n" : "";
    if (current.length + sep.length + mention.length > limit) {
      chunks.push(current);
      current = mention;
    } else {
      current += sep + mention;
    }
    currentHasMentions = true;
  }
  chunks.push(current);
  return chunks;
}

/** IDs de usuario mencionados en un trozo (para allowedMentions). */
export function mentionedIds(chunk: string): string[] {
  return [...chunk.matchAll(/<@!?(\d+)>/g)].map((m) => m[1]!);
}
