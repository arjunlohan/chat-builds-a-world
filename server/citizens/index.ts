import { pending, type ChatEvent } from "../contracts.js";

/** TODO: authoritative roster, 300 citizen cap, commands and 20-minute expiry. */
export function acceptChat(_event: ChatEvent): void {
  pending("Citizen roster");
}
