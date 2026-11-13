/**
 * Shared JSON protocol for the Worker/Durable Object and browser client.
 * Import with `import type { ... } from "../shared/ws-protocol"`.
 *
 * Coordinates use the same logical canvas units on every client, independent
 * of device pixel ratio. Numbers must be finite; brush width must be positive.
 * Color is a hex RGB string (#RRGGBB). These constraints require runtime
 * validation: TypeScript types alone do not validate incoming JSON.
 */

/** One saved stroke segment, drawn from (px, py) to (x, y). */
export interface StrokeSegment {
  x: number;
  y: number;
  px: number;
  py: number;
  /** Color, e.g. "#000000". */
  c: string;
  /** Brush width in logical canvas units. */
  w: number;
}

/** At least one segment; array order is drawing order. */
export type DrawBatch = [StrokeSegment, ...StrokeSegment[]];

export interface DrawMessage {
  type: "draw";
  d: DrawBatch;
}

/** Also relayed downstream so every connected client clears its canvas. */
export interface ClearMessage {
  type: "clear";
}

/**
 * Sent first on connection, before live draw/clear messages.
 * `d` is every saved segment since the latest clear, in drawing order.
 * An empty array represents a blank canvas; replace local history with `d`.
 */
export interface SyncHistoryMessage {
  type: "sync_history";
  d: StrokeSegment[];
}

/** Relayed to clients other than the sender; preserves the submitted batch. */
export interface BroadcastDrawMessage {
  type: "broadcast_draw";
  d: DrawBatch;
}

/** One server-assigned connection ID per WebSocket connection. */
export interface PresenceMessage {
  type: "presence";
  id: string;
  e: "join" | "leave";
}

export type ClientToServerMessage = DrawMessage | ClearMessage;

export type ServerToClientMessage =
  | SyncHistoryMessage
  | BroadcastDrawMessage
  | PresenceMessage
  | ClearMessage;

export type WebSocketMessage = ClientToServerMessage | ServerToClientMessage;
