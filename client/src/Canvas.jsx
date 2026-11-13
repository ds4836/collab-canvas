import { useRef, useEffect, useState } from 'react';
import { socketUrl } from './socket';

function drawLine(ctx, { px, py, x, y, c, w }) {
  ctx.beginPath();
  ctx.strokeStyle = c;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.moveTo(px, py);
  ctx.lineTo(x, y);
  ctx.stroke();
}

export default function Canvas() {
  const canvasRef = useRef(null);
  const connection = useRef(null);
  const ready = useRef(false);
  const lastPosition = useRef(null);
  const pointerId = useRef(null);
  const [status, setStatus] = useState('Connecting…');
  const [connected, setConnected] = useState(false);
  const [people, setPeople] = useState(0);

  useEffect(() => {
    const ctx = canvasRef.current.getContext('2d');
    let disposed = false;
    let retryTimer;
    let delay = 500;
    const members = new Set();

    function connect() {
      if (disposed) return;
      let ws;
      try {
        ws = new WebSocket(socketUrl());
      } catch (error) {
        setStatus(error.message);
        return;
      }
      connection.current = ws;
      ws.addEventListener('message', (event) => {
        if (disposed) return;
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        switch (message.type) {
          case 'sync_history':
            ctx.clearRect(0, 0, 1000, 1000);
            message.d.forEach((segment) => drawLine(ctx, segment));
            members.clear();
            ready.current = true;
            delay = 500;
            setConnected(true);
            setStatus('Connected');
            break;
          case 'broadcast_draw':
            message.d.forEach((segment) => drawLine(ctx, segment));
            break;
          case 'clear':
            ctx.clearRect(0, 0, 1000, 1000);
            lastPosition.current = null;
            pointerId.current = null;
            break;
          case 'presence':
            if (message.e === 'join') members.add(message.id);
            else members.delete(message.id);
            setPeople(members.size);
            break;
          default:
            break;
        }
      });
      ws.addEventListener('close', (event) => {
        if (disposed) return;
        ready.current = false;
        lastPosition.current = null;
        pointerId.current = null;
        setConnected(false);
        setPeople(0);
        if (event.code === 1008) {
          setStatus(event.reason || 'Server rejected the drawing.');
          return;
        }
        setStatus('Reconnecting…');
        retryTimer = setTimeout(connect, delay + Math.random() * 250);
        delay = Math.min(delay * 2, 10000);
      });
    }
    connect();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      ready.current = false;
      connection.current?.close();
    };
  }, []);

  function position(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1000, (event.clientX - rect.left) * 1000 / rect.width)),
      y: Math.max(0, Math.min(1000, (event.clientY - rect.top) * 1000 / rect.height))
    };
  }

  function startDrawing(event) {
    if (!ready.current || pointerId.current !== null || event.button !== 0) return;
    pointerId.current = event.pointerId;
    lastPosition.current = position(event);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function draw(event) {
    if (pointerId.current !== event.pointerId || !lastPosition.current ||
      !ready.current || connection.current?.readyState !== WebSocket.OPEN) return;
    const { x, y } = position(event);
    const segment = { px: lastPosition.current.x, py: lastPosition.current.y, x, y, c: '#000000', w: 5 };
    connection.current.send(JSON.stringify({ type: 'draw', d: [segment] }));
    drawLine(canvasRef.current.getContext('2d'), segment);
    lastPosition.current = { x, y };
  }

  function stopDrawing(event) {
    if (pointerId.current !== event.pointerId) return;
    pointerId.current = null;
    lastPosition.current = null;
  }

  return (
    <main className="canvas-app">
      <div className="canvas-toolbar">
        <p role="status">{status}{connected ? ` · ${people} ${people === 1 ? 'person' : 'people'} online` : ''}</p>
        <button disabled={!connected} onClick={() => {
          if (ready.current && connection.current?.readyState === WebSocket.OPEN) {
            connection.current.send(JSON.stringify({ type: 'clear' }));
          }
        }}>Clear canvas</button>
      </div>
      <p className="canvas-hint">Open this same link on another device or in a private window to draw together.</p>
      <canvas
        ref={canvasRef}
        width={1000}
        height={1000}
        aria-label="Shared drawing canvas"
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        onLostPointerCapture={stopDrawing}
      />
    </main>
  );
}
