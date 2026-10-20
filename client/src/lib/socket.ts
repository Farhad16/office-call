import { io, type Socket } from 'socket.io-client';
import { useEffect, useState } from 'react';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/types.js';

// One shared connection to the same host that served the page.
// Socket.IO reconnects by itself after network drops.
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io();

export type Connection = { connected: boolean; receiverOnline: boolean };

// The server sends the speaker status right after connecting, often before any screen
// is listening, so keep the latest value here.
let lastReceiverOnline = false;
socket.on('receiver:status', ({ online }) => {
  lastReceiverOnline = online;
});

/** Live server + speaker status. */
export function useConnection(): Connection {
  const [connected, setConnected] = useState(socket.connected);
  const [receiverOnline, setReceiverOnline] = useState(lastReceiverOnline);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onReceiver = ({ online }: { online: boolean }) => setReceiverOnline(online);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('receiver:status', onReceiver);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('receiver:status', onReceiver);
    };
  }, []);

  return { connected, receiverOnline: connected && receiverOnline };
}
