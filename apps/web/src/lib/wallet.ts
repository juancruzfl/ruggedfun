import { randomInt } from "node:crypto";

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Fake Solana-looking address. The "Rug" prefix makes it obviously not real. */
export function generateWalletAddress(): string {
  let address = "Rug";
  while (address.length < 44) address += BASE58[randomInt(BASE58.length)];
  return address;
}
