import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';

interface StreamRoom {
  hostId: number;
  hostSocket: WebSocket | null;
  viewers: Map<number, WebSocket>;
  isLive: boolean;
  streamType: 'event' | 'schedule';
  streamId: number;
  startedAt: Date;
}

interface StreamMessage {
  type: 'join' | 'leave' | 'offer' | 'answer' | 'ice-candidate' | 'stream-start' | 'stream-end' | 'viewer-count' | 'viewer-joined' | 'chat';
  roomId: string;
  userId?: number;
  data?: any;
}

class StreamingService {
  private wss: WebSocketServer | null = null;
  private rooms: Map<string, StreamRoom> = new Map();
  private userSockets: Map<number, WebSocket> = new Map();

  initialize(httpServer: Server) {
    this.wss = new WebSocketServer({ server: httpServer, path: '/ws/stream' });

    this.wss.on('connection', (socket: WebSocket) => {
      let currentUserId: number | null = null;
      let currentRoomId: string | null = null;

      socket.on('message', (data: Buffer) => {
        try {
          const message: StreamMessage = JSON.parse(data.toString());
          this.handleMessage(socket, message, (userId, roomId) => {
            currentUserId = userId;
            currentRoomId = roomId;
          });
        } catch (err) {
          console.error('WebSocket message error:', err);
        }
      });

      socket.on('close', () => {
        if (currentUserId && currentRoomId) {
          this.handleDisconnect(currentUserId, currentRoomId);
        }
      });

      socket.on('error', (err) => {
        console.error('WebSocket error:', err);
      });
    });

    console.log('Streaming WebSocket server initialized on /ws/stream');
  }

  private handleMessage(
    socket: WebSocket, 
    message: StreamMessage, 
    setContext: (userId: number, roomId: string) => void
  ) {
    const { type, roomId, userId, data } = message;

    switch (type) {
      case 'stream-start':
        if (userId) {
          this.startStream(roomId, userId, socket, data?.streamType, data?.streamId);
          setContext(userId, roomId);
        }
        break;

      case 'stream-end':
        this.endStream(roomId);
        break;

      case 'join':
        if (userId) {
          this.joinRoom(roomId, userId, socket);
          setContext(userId, roomId);
        }
        break;

      case 'leave':
        if (userId) {
          this.leaveRoom(roomId, userId);
        }
        break;

      case 'offer':
      case 'answer':
      case 'ice-candidate':
        this.relaySignaling(roomId, userId!, type, data);
        break;

      case 'chat':
        this.broadcastToRoom(roomId, {
          type: 'chat',
          roomId,
          userId,
          data
        });
        break;
    }
  }

  private startStream(
    roomId: string, 
    hostId: number, 
    socket: WebSocket,
    streamType: 'event' | 'schedule',
    streamId: number
  ) {
    const room: StreamRoom = {
      hostId,
      hostSocket: socket,
      viewers: new Map(),
      isLive: true,
      streamType,
      streamId,
      startedAt: new Date()
    };
    this.rooms.set(roomId, room);
    this.userSockets.set(hostId, socket);

    this.sendToSocket(socket, {
      type: 'stream-start',
      roomId,
      data: { success: true, message: 'Stream started' }
    });

    console.log(`Stream started: ${roomId} by host ${hostId}`);
  }

  private endStream(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    this.broadcastToRoom(roomId, {
      type: 'stream-end',
      roomId,
      data: { message: 'Stream has ended' }
    });

    room.viewers.forEach((socket, viewerId) => {
      this.userSockets.delete(viewerId);
    });

    if (room.hostSocket) {
      this.userSockets.delete(room.hostId);
    }

    this.rooms.delete(roomId);
    console.log(`Stream ended: ${roomId}`);
  }

  private joinRoom(roomId: string, userId: number, socket: WebSocket) {
    const room = this.rooms.get(roomId);
    if (!room) {
      this.sendToSocket(socket, {
        type: 'join',
        roomId,
        data: { success: false, error: 'Stream not found' }
      });
      return;
    }

    room.viewers.set(userId, socket);
    this.userSockets.set(userId, socket);

    this.sendToSocket(socket, {
      type: 'join',
      roomId,
      data: { success: true, hostId: room.hostId }
    });

    // Notify host that a viewer joined so they can create an offer
    if (room.hostSocket && room.hostSocket.readyState === WebSocket.OPEN) {
      this.sendToSocket(room.hostSocket, {
        type: 'viewer-joined',
        roomId,
        userId,
        data: { viewerId: userId, viewerCount: room.viewers.size }
      });
      
      this.sendToSocket(room.hostSocket, {
        type: 'viewer-count',
        roomId,
        data: { count: room.viewers.size }
      });
    }

    console.log(`Viewer ${userId} joined stream ${roomId}. Total viewers: ${room.viewers.size}`);
  }

  private leaveRoom(roomId: string, userId: number) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    room.viewers.delete(userId);
    this.userSockets.delete(userId);

    if (room.hostSocket && room.hostSocket.readyState === WebSocket.OPEN) {
      this.sendToSocket(room.hostSocket, {
        type: 'viewer-count',
        roomId,
        data: { count: room.viewers.size }
      });
    }
  }

  private relaySignaling(roomId: string, fromUserId: number, type: string, data: any) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const targetUserId = data.targetUserId;
    let targetSocket: WebSocket | undefined;

    if (targetUserId === room.hostId) {
      targetSocket = room.hostSocket || undefined;
    } else {
      targetSocket = room.viewers.get(targetUserId);
    }

    if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
      this.sendToSocket(targetSocket, {
        type: type as any,
        roomId,
        userId: fromUserId,
        data
      });
    }
  }

  private broadcastToRoom(roomId: string, message: StreamMessage) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const messageStr = JSON.stringify(message);

    if (room.hostSocket && room.hostSocket.readyState === WebSocket.OPEN) {
      room.hostSocket.send(messageStr);
    }

    room.viewers.forEach((socket) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(messageStr);
      }
    });
  }

  private sendToSocket(socket: WebSocket, message: StreamMessage) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  private handleDisconnect(userId: number, roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    if (room.hostId === userId) {
      this.endStream(roomId);
    } else {
      this.leaveRoom(roomId, userId);
    }
  }

  getRoomInfo(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    return {
      hostId: room.hostId,
      viewerCount: room.viewers.size,
      isLive: room.isLive,
      streamType: room.streamType,
      streamId: room.streamId,
      startedAt: room.startedAt
    };
  }

  isStreamLive(roomId: string): boolean {
    const room = this.rooms.get(roomId);
    return room?.isLive ?? false;
  }
}

export const streamingService = new StreamingService();
