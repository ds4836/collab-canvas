export function socketUrl() {
  const configured = import.meta.env.VITE_WS_URL;
  if (!configured && !import.meta.env.DEV) {
    throw new Error('The shared canvas server has not been configured.');
  }
  const url = new URL(configured || 'ws://localhost:3001/ws');
  if (!['ws:', 'wss:'].includes(url.protocol) ||
    (window.location.protocol === 'https:' && url.protocol !== 'wss:')) {
    throw new Error('The shared canvas server requires a secure WebSocket URL.');
  }
  url.searchParams.set('room', new URLSearchParams(window.location.search).get('room') || 'shared');
  return url.toString();
}
