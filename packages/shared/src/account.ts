/** Play-money SOL every new wallet starts with. */
export const STARTING_SOL = 10;

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 16;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

// Substring match, so keep entries specific enough not to block normal names.
const BLOCKED = ["nigg", "fag", "retard", "rape", "nazi", "hitler", "kike", "tranny", "cunt", "jeet", "admin", "moderator", "ruggedfun"];

/** Returns an error message, or null if the username is acceptable. Uniqueness is checked by the server. */
export function validateUsername(username: string): string | null {
  if (username.length < USERNAME_MIN) return `At least ${USERNAME_MIN} characters`;
  if (username.length > USERNAME_MAX) return `At most ${USERNAME_MAX} characters`;
  if (!USERNAME_PATTERN.test(username)) return "Letters, numbers and _ only";
  const lower = username.toLowerCase();
  if (BLOCKED.some((word) => lower.includes(word))) return "Pick a different name";
  return null;
}

import type { PositionSummary } from "./trading";

export interface Me {
  user: { id: string; username: string; createdAt: number };
  wallet: { address: string; solBalance: number };
  positions: PositionSummary[];
}

const NAME_ADJECTIVES = [
  "Based", "Sleepy", "Lucky", "Salty", "Turbo", "Giga", "Smol", "Chill", "Spicy", "Shiny",
  "Brave", "Sneaky", "Wild", "Comfy", "Frosty", "Cosmic", "Mega", "Zesty", "Fuzzy", "Hyper",
];
const NAME_NOUNS = [
  "Ape", "Frog", "Whale", "Degen", "Pepe", "Shiba", "Cat", "Hodler", "Goblin", "Otter",
  "Bull", "Bear", "Chad", "Fren", "Gnome", "Llama", "Panda", "Moose", "Crab", "Sloth",
];

/**
 * A random valid username like "SneakyOtter42" (at most 15 characters). Re-rolls until the name
 * passes validateUsername, since two harmless words can join into a blocked one ("Hyper"+"Ape").
 */
export function randomUsername(random: () => number = Math.random): string {
  const pick = (items: string[]) => items[Math.floor(random() * items.length)]!;
  for (;;) {
    const name = `${pick(NAME_ADJECTIVES)}${pick(NAME_NOUNS)}${10 + Math.floor(random() * 990)}`;
    if (validateUsername(name) === null) return name;
  }
}
