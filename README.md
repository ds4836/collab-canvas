# Shared canvas

React/Vite frontend on Vercel, with a Cloudflare Worker and one SQLite-backed
Durable Object per room for WebSocket connections and saved drawing history.
The existing Node WebSocket example remains at `server/index.js` but is not the
deployment backend; `npm run legacy` runs that older, stateless protocol.

## Develop

1. In `server`, run `npm ci` and `npm run dev`.
2. In `client`, run `npm ci` and `npm run dev`.
3. Open the client in two independent browser sessions. Both should show
   `Connected · 2 people online`; strokes should appear in both directions.

The client uses the local Worker on port 3001 during development. To use another
backend, put `VITE_WS_URL=wss://YOUR-WORKER.workers.dev/ws` in `client/.env.local`.
All clients use a 1000 × 1000 logical canvas, scaled to fit their screen.

## Deploy

1. Authenticate Cloudflare with `npx wrangler login` from `server`.
2. Run `npm run deploy` from `server`. The configured Worker name is
   `collab-canvas-api`. Copy its HTTPS URL and change `https://` to `wss://`,
   then append `/ws`.
3. Import this repository into Vercel with the repository root as the root
   directory. The root `vercel.json` sets the frontend install/build/output paths.
4. Set the Vercel **build environment variable** `VITE_WS_URL` to the public
   Worker WebSocket URL and deploy. This value is public, not a secret.
5. Open the Vercel URL on two devices or in separate browser profiles. After
   drawing in both, open a third session to confirm history loads. Use
   **Clear canvas** to confirm all sessions reset.

Do not publish a client without `VITE_WS_URL`: it will display a configuration
error instead of silently trying to connect to the visitor's own computer.
Change the variable and redeploy whenever the backend URL changes.

## Rooms and limits

The default room is `shared`. Append `?room=my-test` to the frontend URL for an
isolated canvas; share that exact URL with your partner. Room names accept
1–64 letters, digits, underscores, or hyphens. Anyone with a room URL can draw
and clear it; these are public test rooms without authentication.

The Worker validates batches (1–256 segments), coordinates (0–1000), colors
(`#RRGGBB`), and brush widths (greater than 0, up to 100). Each room saves up to
50,000 segments; clear it to continue after that limit. History persists across
disconnects and Worker restarts. Client reconnection reloads the server's saved
history. Drawing is disabled until that history has loaded.

The protocol is documented in `shared/ws-protocol.ts`. The deployed client and
Worker use `draw`, `broadcast_draw`, `sync_history`, `presence`, and `clear`.

## Automated browser check

With Python Playwright and its Chromium browser installed, run from the repo root:

```sh
python tests/multiplayer.py
```

This expects the dev client on port 5173 and Worker on port 3001, and uses a
unique test room. It checks concurrent drawing, history, clear, reconnect,
presence, and coordinate scaling across different viewports. It also checks
raw WebSocket batch validation and room isolation. To check a deployed frontend,
set `CANVAS_TEST_URL` and `CANVAS_TEST_WS_URL` to its public endpoints first.
