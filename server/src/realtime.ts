import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, OfficeRequest, ServerToClientEvents } from '../../shared/types.js';
import { listPendingRequests, markAnnounced } from './db.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

const RECEIVERS = 'receivers';
let io: IO | null = null;

function receiverOnline(): boolean {
  return (io?.sockets.adapter.rooms.get(RECEIVERS)?.size ?? 0) > 0;
}

function broadcastReceiverStatus() {
  io?.emit('receiver:status', { online: receiverOnline() });
}

export function setupRealtime(httpServer: HttpServer) {
  io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, { serveClient: false });

  io.on('connection', (socket) => {
    // Tell every new client whether the speaker is listening.
    socket.emit('receiver:status', { online: receiverOnline() });

    socket.on('receiver:join', (ack) => {
      socket.join(RECEIVERS);
      broadcastReceiverStatus();
      if (typeof ack === 'function') ack(listPendingRequests());
    });

    socket.on('request:announced', (update) => {
      const id = Number(update?.id);
      if (!Number.isInteger(id) || !socket.rooms.has(RECEIVERS)) return;
      if (markAnnounced(id)) io!.emit('request:status', { id, status: 'announced' });
    });

    socket.on('disconnect', () => {
      // Rooms are already left here, so this sees the new count.
      broadcastReceiverStatus();
    });
  });
}

/** Pushes a newly saved request to every open receiver page. */
export function deliverRequest(request: OfficeRequest) {
  io?.to(RECEIVERS).emit('request:new', request);
}

export { receiverOnline };
