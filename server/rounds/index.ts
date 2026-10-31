import { pending, type ChatEvent } from "../contracts.js";

/** TODO: five-minute !idea rounds, top-three !vote and !rollback voting. */
export function acceptRoundCommand(_event: ChatEvent): void {
  pending("Rounds and votes");
}
