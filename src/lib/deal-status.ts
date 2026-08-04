/**
 * Status vocabulary shared by the server and the browser. Kept free of any
 * server-only import so client components can render a badge without dragging
 * the database layer into the bundle.
 */
export type DealStatus =
  | "AWAITING_PAYMENT"
  | "FUNDED"
  | "DELIVERED"
  | "COMPLETED"
  | "DISPUTED"
  | "REFUNDED"
  | "CANCELLED"
  | "EXPIRED";

export const STATUS_LABELS: Record<DealStatus, string> = {
  AWAITING_PAYMENT: "Awaiting payment",
  FUNDED: "Funds in escrow",
  DELIVERED: "Delivered — inspection",
  COMPLETED: "Completed",
  DISPUTED: "In dispute",
  REFUNDED: "Refunded",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

export const STATUS_TONES: Record<DealStatus, string> = {
  AWAITING_PAYMENT: "amber",
  FUNDED: "blue",
  DELIVERED: "violet",
  COMPLETED: "green",
  DISPUTED: "red",
  REFUNDED: "slate",
  CANCELLED: "slate",
  EXPIRED: "slate",
};

/** Statuses where the deal is still live and needs someone to act. */
export const OPEN_STATUSES: DealStatus[] = ["AWAITING_PAYMENT", "FUNDED", "DELIVERED", "DISPUTED"];
