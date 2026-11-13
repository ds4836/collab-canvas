/**
 * Shared JSON protocol for the Worker/Durable Object and browser client.
 * 
 * Coordinates use the same logical canvas units on every client, independent
 * of device pixel ratio. Numbers must be finite; brush width must be positive.
 * These constraints require runtime
 * 
 */

/**
 * One saved stroke segment, drawn from (px, py) to (x, y).
 * @typedef {Object} StrokeSegment
 * @property {number} x
 * @property {number} y
 * @property {number} px
 * @property {number} py
 * @property {string} c
 * @property {number} w
 */

/**
 * @typedef {StrokeSegment[]} DrawBatch
 */

/**
 * @typedef {Object} DrawMessage
 * @property {"draw"} type
 * @property {DrawBatch} d
 */

/**
 * @typedef {Object} ClearMessage
 * @property {"clear"} type
 */

/**
 * @typedef {Object} SyncHistoryMessage
 * @property {"sync_history"} type
 * @property {StrokeSegment[]} d
 */

/**
 * @typedef {Object} BroadcastDrawMessage
 * @property {"broadcast_draw"} type
 * @property {DrawBatch} d
 */

/**
 * @typedef {Object} PresenceMessage
 * @property {"presence"} type
 * @property {string} id
 * @property {"join" | "leave"} e
 */

/**
 * @typedef {DrawMessage | ClearMessage} ClientToServerMessage
 */

/**
 * @typedef {SyncHistoryMessage | BroadcastDrawMessage | PresenceMessage | ClearMessage} ServerToClientMessage
 */

/**
 * @typedef {ClientToServerMessage | ServerToClientMessage} WebSocketMessage
 */

export {};