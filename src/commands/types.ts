import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";
import type { AppContext } from "../context.js";
import type { Jobs } from "../jobs/scheduler.js";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "../types.js";

export interface BotContext extends AppContext {
  jobs: Jobs;
}

export interface Command {
  data: { name: string; toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };
  execute(interaction: ChatInputCommandInteraction<"cached">, ctx: BotContext): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction<"cached">, ctx: BotContext): Promise<void>;
}

export const categoryChoices = CATEGORIES.map((c) => ({ name: CATEGORY_LABELS[c], value: c }));

export function parseCategory(value: string): Category {
  if (!(CATEGORIES as readonly string[]).includes(value)) throw new Error(`Categoría desconocida: ${value}`);
  return value as Category;
}
