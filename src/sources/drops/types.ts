export interface DropReward {
  name: string;
  image: string | null;
  /** Minutos de visualización necesarios (si la fuente lo indica). */
  minutes: number | null;
}

export interface DropCampaign {
  id: string;
  gameKey: string;
  gameName: string;
  boxArt: string | null;
  name: string;
  startAt: string;
  endAt: string;
  rewards: DropReward[];
  /** Página con detalles de la campaña o, si no hay, la categoría del juego en Twitch. */
  url: string;
  /** Enlace para vincular la cuenta del juego, si la campaña lo requiere. */
  accountLinkUrl: string | null;
}

/** Cualquier fuente de campañas de drops. Para cambiar de proveedor basta con otra implementación. */
export interface DropsSource {
  readonly name: string;
  fetch(): Promise<DropCampaign[]>;
}

export function twitchGameUrl(gameName: string): string {
  return `https://www.twitch.tv/directory/game/${encodeURIComponent(gameName)}?filter=drops`;
}
