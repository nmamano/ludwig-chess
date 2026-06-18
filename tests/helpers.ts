// Shared test utilities.
import type { MatchPlayer } from "../server/match";

export function players(): { p1: MatchPlayer; p2: MatchPlayer } {
  return {
    p1: { id: "p1", name: "Alice", connected: true },
    p2: { id: "p2", name: "Bob", connected: true },
  };
}
