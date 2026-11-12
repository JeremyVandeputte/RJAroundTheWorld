// The six reactions, in display order. Shared by the server and the interface.
export const REACTIONS = [
  { type: "like", emoji: "👍", label: "J'aime" },
  { type: "love", emoji: "❤️", label: "J'adore" },
  { type: "haha", emoji: "😆", label: "Haha" },
  { type: "wow", emoji: "😮", label: "Wouah" },
  { type: "sad", emoji: "😢", label: "Triste" },
  { type: "angry", emoji: "😡", label: "En colère" },
] as const;

export type ReactionKind = (typeof REACTIONS)[number]["type"];

export function isReactionKind(value: string): value is ReactionKind {
  return REACTIONS.some((reaction) => reaction.type === value);
}
