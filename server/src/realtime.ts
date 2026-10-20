import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import { Server } from 'socket.io';
import type { ClientToServerEvents, OfficeRequest, ServerToClientEvents } from '../../shared/types.js';
import { listUnannouncedRequests, markAnnounced } from './db.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

const RECEIVERS = 'receivers';
let io: IO | null = null;

export function receiverOnline(): boolean {
  return (io?.sockets.adapter.rooms.get(RECEIVERS)?.size ?? 0) > 0;
}

function broadcastReceiverStatus() {
  io?.emit('receiver:status', { online: receiverOnline() });
}

export function setupRealtime(httpServer: HttpServer | HttpsServer) {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, { serveClient: false });

  io.on('connection', (socket) => {
    // Tell every new client whether the speaker is listening.
    socket.emit('receiver:status', { online: receiverOnline() });

    socket.on('receiver:join', (ack) => {
      socket.join(RECEIVERS);
      broadcastReceiverStatus();
      if (typeof ack === 'function') ack(listUnannouncedRequests());
    });

    socket.on('request:announced', (update) => {
      const id = Number(update?.id);
      if (!Number.isInteger(id) || !socket.rooms.has(RECEIVERS)) return;
      const updated = markAnnounced(id);
      if (updated) broadcastUpdate(updated);
    });

    socket.on('disconnect', () => {
      // Rooms are already left here, so this sees the new count.
      broadcastReceiverStatus();
    });
  });
}

/**
 * A newly saved request goes to every client: receivers announce it, dashboards add it
 * to the queue. (Everyone on the office network can see the dashboard anyway.)
 */
export function broadcastNew(request: OfficeRequest) {
  io?.emit('request:new', request);
}

/** Any change to an existing request. Receivers never announce these. */
export function broadcastUpdate(request: OfficeRequest) {
  io?.emit('request:updated', request);
}

export function closeRealtime() {
  io?.close();
}
