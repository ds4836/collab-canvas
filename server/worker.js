import { DurableObject } from 'cloudflare:workers';

const MAX_BATCH = 256;
const MAX_HISTORY = 50000;

function validSegment(s) {
  return s && ['x', 'y', 'px', 'py'].every((key) =>
    Number.isFinite(s[key]) && s[key] >= 0 && s[key] <= 1000
  ) && /^#[0-9a-f]{6}$/i.test(s.c) && Number.isFinite(s.w) && s.w > 0 && s.w <= 100;
}

/** One Durable Object owns all connections and persistent strokes in a room. */
export class CanvasRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS strokes (seq INTEGER PRIMARY KEY, data TEXT NOT NULL)');
  }

  fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    const id = crypto.randomUUID();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id });
    // No await between snapshot and live events: history arrives first.
    const d = this.sql.exec('SELECT data FROM strokes ORDER BY seq').toArray()
      .map((row) => JSON.parse(row.data));
    server.send(JSON.stringify({ type: 'sync_history', d }));
    for (const peer of this.ctx.getWebSockets()) {
      if (peer !== server && peer.readyState === WebSocket.OPEN) {
        server.send(JSON.stringify({ type: 'presence', id: peer.deserializeAttachment().id, e: 'join' }));
      }
    }
    this.broadcast({ type: 'presence', id, e: 'join' });
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 65536) {
      ws.close(1008, 'Expected a JSON message under 64 KiB');
      return;
    }
    let message;
    try { message = JSON.parse(raw); } catch {
      ws.close(1008, 'Invalid JSON');
      return;
    }
    if (message?.type === 'clear') {
      this.sql.exec('DELETE FROM strokes');
      this.broadcast({ type: 'clear' });
    } else if (message?.type === 'draw' && Array.isArray(message.d) &&
      message.d.length > 0 && message.d.length <= MAX_BATCH && message.d.every(validSegment)) {
      const count = this.sql.exec('SELECT COUNT(*) AS n FROM strokes').one().n;
      if (count + message.d.length > MAX_HISTORY) {
        ws.close(1008, 'Canvas history full; clear the canvas to continue');
        return;
      }
      const d = message.d.map(({ x, y, px, py, c, w }) => ({ x, y, px, py, c, w }));
      this.ctx.storage.transactionSync(() => {
        for (const segment of d) {
          this.sql.exec('INSERT INTO strokes (data) VALUES (?)', JSON.stringify(segment));
        }
      });
      this.broadcast({ type: 'broadcast_draw', d }, ws);
    } else {
      ws.close(1008, 'Invalid canvas command');
    }
  }

  broadcast(message, except) {
    const data = JSON.stringify(message);
    for (const peer of this.ctx.getWebSockets()) {
      if (peer !== except && peer.readyState === WebSocket.OPEN) {
        try { peer.send(data); } catch { peer.close(1011, 'Send failed'); }
      }
    }
  }

  disconnect(ws) {
    const attachment = ws.deserializeAttachment();
    if (!attachment || attachment.left) return;
    ws.serializeAttachment({ ...attachment, left: true });
    this.broadcast({ type: 'presence', id: attachment.id, e: 'leave' }, ws);
  }

  webSocketClose(ws, code, reason) {
    this.disconnect(ws);
    // 1006 reports a lost transport and must never be sent in a close frame.
    if (code === 1006) return;
    ws.close(code === 1005 ? 1000 : code, reason);
  }
  webSocketError(ws) { this.disconnect(ws); ws.close(1011, 'Connection error'); }
}

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return Response.json({ ok: true });
    if (url.pathname !== '/ws') return new Response('Not found', { status: 404 });
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket required', { status: 426 });
    }
    const room = url.searchParams.get('room') || 'shared';
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(room)) {
      return new Response('Invalid room', { status: 400 });
    }
    return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
  }
};
