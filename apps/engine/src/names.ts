import type { Rng } from "@ruggedfun/sim";

const PREFIXES = [
  "Baby", "Based", "Super", "Mega", "Turbo", "Giga", "Dark", "Golden", "Smol", "Chad", "Sad", "Angry",
  "Moon", "Space", "Cyber", "Rich", "Broke", "Lil", "King", "Sigma", "Fat", "Sleepy", "Wet", "Crying",
];
const NOUNS = [
  "Cat", "Dog", "Frog", "Pepe", "Hamster", "Penguin", "Goat", "Monkey", "Shiba", "Bonk", "Whale", "Duck",
  "Bear", "Bull", "Otter", "Capybara", "Wojak", "Banana", "Pizza", "Rocket", "Gnome", "Raccoon", "Toad",
  "Fish", "Hippo", "Goblin", "Pigeon", "Llama", "Sloth", "Corgi", "Possum", "Turtle", "Moth", "Crab",
];
const SUFFIXES = ["", "", "", "", " Inu", " AI", " Coin", " 2.0", " Classic", " On Sol", " Wif Hat", " Cult"];

const DESCRIPTIONS = [
  "the only {name} that matters. dev is based. lp burned (trust)",
  "{name} is going to the moon and you're not invited",
  "community takeover. we are all {name} now",
  "no roadmap. no utility. just {name}",
  "{name} was here before it was cool",
  "1 {name} = 1 {name}",
  "the official {name} of the next bull run",
  "devs doxxed (as {name})",
  "{name} said it's fine. it's fine.",
  "not financial advice. {name} advice.",
];

const HANDLE_WORDS = [
  "degen", "ape", "whale", "anon", "sol", "pump", "chad", "rekt", "moon", "jeet", "fren", "gm", "wagmi",
  "ngmi", "bags", "diamond", "paper", "sniper", "dev", "larp",
];

export interface TokenMeta {
  name: string;
  ticker: string;
  description: string;
  creatorHandle: string;
  imageUrl: string;
}

const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng.next() * items.length)]!;

export function generateHandle(rng: Rng): string {
  const a = pick(rng, HANDLE_WORDS);
  const b = pick(rng, HANDLE_WORDS);
  switch (rng.int(0, 3)) {
    case 0:
      return `${a}_${b}${rng.int(1, 999)}`;
    case 1:
      return `xX_${a}_Xx`;
    case 2:
      return `${a}${b}`;
    default:
      return `${a}${rng.int(1, 9999)}`;
  }
}

function toTicker(...parts: string[]): string {
  return parts.join("").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

/**
 * Random token name, ticker, blurb, creator and avatar.
 * `attempt` > 0 adds digits to the ticker, for retrying after a ticker collision.
 */
export function generateTokenMeta(rng: Rng, attempt = 0): TokenMeta {
  const prefix = rng.chance(0.5) ? pick(rng, PREFIXES) : "";
  const noun = pick(rng, NOUNS);
  const suffix = pick(rng, SUFFIXES);
  const name = [prefix, noun].filter(Boolean).join(" ") + suffix;

  const suffixWord = suffix.trim().split(" ")[0] ?? "";
  let ticker = [
    toTicker(noun),
    toTicker(prefix.slice(0, 1), noun),
    toTicker(noun, suffixWord),
    toTicker(prefix, noun),
  ][rng.int(0, 3)]!;
  if (ticker.length < 3) ticker = toTicker(prefix, noun, suffixWord);
  if (attempt > 0) ticker = ticker.slice(0, 6) + rng.int(10 ** attempt, 10 ** (attempt + 1) - 1);

  return {
    name,
    ticker,
    description: pick(rng, DESCRIPTIONS).replaceAll("{name}", name),
    creatorHandle: generateHandle(rng),
    imageUrl: `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${encodeURIComponent(ticker)}`,
  };
}
