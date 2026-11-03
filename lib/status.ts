export type GenerationStatus =
  | "pending"
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type TopicStatus =
  | "pending"
  | "generating"
  | "completed"
  | "archived";
