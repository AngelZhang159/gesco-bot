import type { Db } from "../index.js";
import { DropsFilterRepo } from "./dropsFilters.js";
import { GuildRepo } from "./guilds.js";
import { ItemRepo } from "./items.js";
import { PickemRepo } from "./pickems.js";
import { PostRepo } from "./posts.js";
import { SubscriptionRepo } from "./subscriptions.js";

export interface Repos {
  guilds: GuildRepo;
  subs: SubscriptionRepo;
  filters: DropsFilterRepo;
  items: ItemRepo;
  posts: PostRepo;
  pickems: PickemRepo;
}

export function createRepos(db: Db): Repos {
  return {
    guilds: new GuildRepo(db),
    subs: new SubscriptionRepo(db),
    filters: new DropsFilterRepo(db),
    items: new ItemRepo(db),
    posts: new PostRepo(db),
    pickems: new PickemRepo(db),
  };
}
