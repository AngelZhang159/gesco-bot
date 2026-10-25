import type { Client } from "discord.js";
import type { AppConfig } from "./config.js";
import type { Repos } from "./db/repos/index.js";
import type { Publisher } from "./notifier/publisher.js";
import type { DropsSource } from "./sources/drops/types.js";

export interface AppContext {
  config: AppConfig;
  client: Client;
  repos: Repos;
  publisher: Publisher;
  dropsSource: DropsSource;
}
