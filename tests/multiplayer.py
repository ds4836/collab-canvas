"""Browser integration checks against a real Worker and separate user contexts."""
import asyncio
import json
import os
import uuid
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from playwright.async_api import async_playwright, expect


def in_room(url, room):
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query))
    query['room'] = room
    return urlunsplit(parts._replace(query=urlencode(query)))


async def stroke(page, start, end):
    box = await page.locator('canvas').bounding_box()
    def point(p):
        return (box['x'] + p[0] * box['width'] / 1000,
                box['y'] + p[1] * box['height'] / 1000)
    await page.mouse.move(*point(start))
    await page.mouse.down()
    await page.mouse.move(*point(end), steps=12)
    await page.mouse.up()


async def ink(page, x, y, present=True):
    await page.wait_for_function(
        '({x, y, present}) => (document.querySelector("canvas").getContext("2d")'
        '.getImageData(x, y, 1, 1).data[3] > 0) === present',
        arg={'x': x, 'y': y, 'present': present})


async def main():
    base = os.environ.get('CANVAS_TEST_URL', 'http://127.0.0.1:5173')
    ws_base = os.environ.get('CANVAS_TEST_WS_URL', 'ws://127.0.0.1:3001/ws')
    room = 'test-' + uuid.uuid4().hex
    url = in_room(base, room)
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        contexts = [await browser.new_context(viewport={'width': w, 'height': 1300})
                    for w in [1280, 520, 900]]
        for context in contexts:
            await context.add_init_script('''
                window.testSockets = [];
                const Native = window.WebSocket;
                window.WebSocket = class extends Native {
                  constructor(...args) { super(...args); window.testSockets.push(this); }
                };
            ''')
        pages = [await context.new_page() for context in contexts]
        for page in pages:
            page.on('pageerror', lambda error: errors.append(str(error)))
        a, b, c = pages
        await asyncio.gather(a.goto(url), b.goto(url))
        await asyncio.gather(*(expect(page.get_by_role('status')).to_have_text(
            'Connected · 2 people online') for page in [a, b]))
        await asyncio.gather(stroke(a, (100, 100), (300, 100)),
                             stroke(b, (100, 200), (300, 200)))
        for page in [a, b]:
            await ink(page, 200, 100)
            await ink(page, 200, 200)
        print('PASS: simultaneous drawing reaches both users at different screen sizes')

        await c.goto(url)
        await expect(c.get_by_role('status')).to_have_text('Connected · 3 people online')
        await ink(c, 200, 100)
        await ink(c, 200, 200)
        print('PASS: a late joiner receives the saved drawing history')

        await a.evaluate('window.testSockets.filter(ws => ws.readyState === 1 && new URL(ws.url).pathname === "/ws").forEach(ws => ws.close())')
        await expect(a.get_by_role('status')).to_have_text('Reconnecting…')
        await expect(a.get_by_role('status')).to_have_text('Connected · 3 people online')
        await ink(a, 200, 100)
        await stroke(a, (100, 300), (300, 300))
        await ink(b, 200, 300)
        print('PASS: reconnect reloads history and restores live drawing')

        await b.get_by_role('button', name='Clear canvas').click()
        for page in pages:
            await ink(page, 200, 100, False)
            await ink(page, 200, 200, False)
            await ink(page, 200, 300, False)
        await c.reload()
        await expect(c.get_by_role('status')).to_have_text('Connected · 3 people online')
        await ink(c, 200, 100, False)
        print('PASS: clear resets every client and the persisted history')

        await c.close()
        await expect(a.get_by_role('status')).to_have_text('Connected · 2 people online')
        print('PASS: presence updates when a user disconnects')

        # Exercise batching, rejection, and isolation without changing the UI.
        raw = await a.evaluate('''async ({url, other}) => {
          function connect(url) {
            return new Promise((resolve, reject) => {
              const ws = new WebSocket(url);
              const messages = [];
              ws.addEventListener('message', e => {
                const message = JSON.parse(e.data);
                messages.push(message);
                if (message.type === 'sync_history') resolve({ws, messages});
              });
              ws.addEventListener('error', reject);
            });
          }
          const sender = await connect(url);
          const receiver = await connect(url);
          const isolated = await connect(other);
          const segment = {px: 20, py: 400, x: 30, y: 400, c: '#000000', w: 5};
          const received = new Promise(resolve => receiver.ws.addEventListener('message', e => {
            const message = JSON.parse(e.data);
            if (message.type === 'broadcast_draw') resolve(message);
          }));
          sender.ws.send(JSON.stringify({type: 'draw', d: [segment, {...segment, x: 40}]}));
          const batch = await received;
          const late = await connect(url);
          const rejected = new Promise(resolve => sender.ws.addEventListener('close', e => resolve(e.code)));
          sender.ws.send(JSON.stringify({type: 'draw', d: [{...segment, x: -1}]}));
          const code = await rejected;
          const unchanged = await connect(url);
          const result = {batch: batch.d.length,
            history: late.messages[0].d.length,
            afterInvalid: unchanged.messages[0].d.length,
            isolated: isolated.messages[0].d.length, code,
            senderEcho: sender.messages.some(m => m.type === 'broadcast_draw')};
          [receiver, isolated, late, unchanged].forEach(peer => peer.ws.close());
          return result;
        }''', {'url': in_room(ws_base, room), 'other': in_room(ws_base, room + '-other')})
        assert raw == {'batch': 2, 'history': 2, 'afterInvalid': 2,
                       'isolated': 0, 'code': 1008, 'senderEcho': False}, json.dumps(raw)
        print('PASS: batches, sender exclusion, invalid-message rejection, and room isolation')
        assert not errors, errors
        for context in contexts:
            await context.close()
        await browser.close()
    print('All multiplayer checks passed.')


if __name__ == '__main__':
    asyncio.run(main())
