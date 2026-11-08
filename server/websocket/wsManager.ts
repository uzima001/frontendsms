import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import url from 'url';
import { dbRepo, Device, SmsMessage } from '../db/database.js';
import { smsQueue } from '../services/queueService.js';
import { aiService } from '../services/aiService.js';

interface AuthenticatedDeviceSocket {
  ws: WebSocket;
  deviceId: string;
  userId: string;
  connectedAt: Date;
  lastPing: Date;
}

interface AuthenticatedUserSocket {
  ws: WebSocket;
  userId: string;
}

export class WebSocketManager {
  private deviceWss: WebSocketServer;
  private userWss: WebSocketServer;

  // Active sockets registries
  private activeDevices: Map<string, AuthenticatedDeviceSocket> = new Map();
  private activeUsers: Map<string, Set<AuthenticatedUserSocket>> = new Map();

  // Recent events log for developer inspector
  public eventLogs: Array<{
    id: string;
    direction: 'INBOUND' | 'OUTBOUND';
    endpoint: '/device/connect' | '/user/connect';
    targetId: string;
    event: string;
    payload: unknown;
    timestamp: string;
  }> = [];

  constructor(server: HttpServer) {
    // We attach wss to http server using noServer mode so we can route by path
    this.deviceWss = new WebSocketServer({ noServer: true });
    this.userWss = new WebSocketServer({ noServer: true });

    this.setupUpgradeHandler(server);
    this.setupDeviceWss();
    this.setupUserWss();
    this.setupHeartbeatSweep();

    // Register queue callbacks
    smsQueue.registerCallbacks(
      (deviceId, command) => this.dispatchCommandToDevice(deviceId, command),
      (userId, eventName, payload) => this.broadcastToUser(userId, eventName, payload)
    );
  }

  private setupUpgradeHandler(server: HttpServer) {
    server.on('upgrade', (request, socket, head) => {
      const parsedUrl = url.parse(request.url || '', true);
      const pathname = parsedUrl.pathname;

      if (pathname === '/device/connect') {
        // Authenticate Android device
        const authHeader = request.headers['authorization'];
        let token = '';
        if (authHeader && authHeader.startsWith('Bearer ')) {
          token = authHeader.slice(7).trim();
        } else if (parsedUrl.query && parsedUrl.query.token) {
          token = String(parsedUrl.query.token);
        }

        if (!token) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }

        // Verify token hash
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const cred = dbRepo.getDeviceCredentialByHash(tokenHash) || 
                     dbRepo.getRaw().device_credentials.find(c => c.token_plain === token && !c.revoked_at);

        if (!cred) {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }

        const device = dbRepo.getDeviceById(cred.device_id);
        if (!device || device.connection_status === 'REVOKED' || device.revoked_at) {
          socket.write('HTTP/1.1 403 Forbidden - Device Revoked\r\n\r\n');
          socket.destroy();
          return;
        }

        this.deviceWss.handleUpgrade(request, socket, head, (ws) => {
          (ws as unknown as Record<string, unknown>).deviceId = device.id;
          (ws as unknown as Record<string, unknown>).userId = device.user_id;
          this.deviceWss.emit('connection', ws, request);
        });
      } else if (pathname === '/user/connect') {
        // Authenticate website user
        let userId = '';
        const token = parsedUrl.query?.token ? String(parsedUrl.query.token) : '';

        // For dashboard, support demo token or check user
        if (token) {
          const user = dbRepo.getUserById(token) || dbRepo.getUserByEmail(token);
          if (user) userId = user.id;
        }
        
        // If not specified, default to first active admin user
        if (!userId) {
          userId = dbRepo.getRaw().users[0]?.id || 'usr_admin_001';
        }

        this.userWss.handleUpgrade(request, socket, head, (ws) => {
          (ws as unknown as Record<string, unknown>).userId = userId;
          this.userWss.emit('connection', ws, request);
        });
      } else {
        // Not our WS path
      }
    });
  }

  private setupDeviceWss() {
    this.deviceWss.on('connection', (ws: WebSocket, req) => {
      const deviceId = (ws as unknown as Record<string, unknown>).deviceId as string;
      const userId = (ws as unknown as Record<string, unknown>).userId as string;

      console.log(`[WS-Device] Device ${deviceId} authenticated & connected from ${req.socket.remoteAddress}`);

      // Close any existing socket for this device
      const existing = this.activeDevices.get(deviceId);
      if (existing && existing.ws !== ws) {
        try { existing.ws.close(1000, 'Replaced by newer connection'); } catch {}
      }

      const devSocket: AuthenticatedDeviceSocket = {
        ws,
        deviceId,
        userId,
        connectedAt: new Date(),
        lastPing: new Date()
      };
      this.activeDevices.set(deviceId, devSocket);

      // Update device state in DB
      dbRepo.updateDevice(deviceId, {
        connection_status: 'CONNECTED',
        gateway_status: 'IDLE',
        connected_at: new Date().toISOString(),
        last_heartbeat_at: new Date().toISOString()
      });

      // Notify User Dashboard
      this.broadcastToUser(userId, 'DEVICE_CONNECTED', {
        device_id: deviceId,
        timestamp: new Date().toISOString(),
        status: 'CONNECTED'
      });

      // Log event
      this.logEvent('INBOUND', '/device/connect', deviceId, 'DEVICE_CONNECTED', { deviceId });

      // Notify SMS Queue
      smsQueue.onDeviceConnected(deviceId);

      ws.on('message', async (data: Buffer | string) => {
        try {
          const text = data.toString();
          const parsed = JSON.parse(text);
          await this.handleDeviceMessage(devSocket, parsed);
        } catch (err) {
          console.error(`[WS-Device] Error parsing message from device ${deviceId}:`, err);
        }
      });

      ws.on('close', (code, reason) => {
        console.log(`[WS-Device] Device ${deviceId} disconnected. Code: ${code}, Reason: ${reason}`);
        this.activeDevices.delete(deviceId);

        const currentDev = dbRepo.getDeviceById(deviceId);
        if (currentDev && currentDev.connection_status !== 'REVOKED') {
          dbRepo.updateDevice(deviceId, {
            connection_status: 'DISCONNECTED',
            gateway_status: 'OFFLINE'
          });
          this.broadcastToUser(userId, 'DEVICE_DISCONNECTED', {
            device_id: deviceId,
            timestamp: new Date().toISOString(),
            status: 'DISCONNECTED'
          });
        }
      });

      ws.on('error', (err) => {
        console.error(`[WS-Device] Socket error for device ${deviceId}:`, err);
      });
    });
  }

  private setupUserWss() {
    this.userWss.on('connection', (ws: WebSocket) => {
      const userId = (ws as unknown as Record<string, unknown>).userId as string;
      console.log(`[WS-User] Dashboard client connected for user ${userId}`);

      if (!this.activeUsers.has(userId)) {
        this.activeUsers.set(userId, new Set());
      }
      const userSockets = this.activeUsers.get(userId)!;
      const userSock: AuthenticatedUserSocket = { ws, userId };
      userSockets.add(userSock);

      // Send initial welcome sync
      this.sendToUserSocket(userSock, 'CONNECTION_ESTABLISHED', {
        connected: true,
        user_id: userId,
        server_time: new Date().toISOString(),
        online_devices: Array.from(this.activeDevices.keys())
      });

      ws.on('close', () => {
        userSockets.delete(userSock);
        if (userSockets.size === 0) this.activeUsers.delete(userId);
      });

      ws.on('error', () => {
        userSockets.delete(userSock);
      });
    });
  }

  // Handle incoming event envelope from Android Gateway Agent
  private async handleDeviceMessage(devSocket: AuthenticatedDeviceSocket, envelope: Record<string, unknown>) {
    const { event, event_id, device_id, payload } = envelope as {
      event: string;
      event_id: string;
      device_id: string;
      timestamp: string;
      payload: Record<string, unknown>;
    };

    if (device_id !== devSocket.deviceId) {
      console.warn(`[WS-Device] Device ID mismatch! Authenticated: ${devSocket.deviceId}, Envelope: ${device_id}`);
      return;
    }

    devSocket.lastPing = new Date();
    this.logEvent('INBOUND', '/device/connect', devSocket.deviceId, event, envelope);

    switch (event) {
      case 'DEVICE_HEARTBEAT': {
        const batteryLevel = typeof payload?.battery_level === 'number' ? payload.battery_level : 85;
        const isCharging = Boolean(payload?.is_charging);
        const simSlots = Array.isArray(payload?.sim_slots) ? payload.sim_slots : undefined;

        dbRepo.updateDevice(devSocket.deviceId, {
          battery_level: batteryLevel,
          is_charging: isCharging,
          ...(simSlots ? { sim_slots: simSlots } : {}),
          last_heartbeat_at: new Date().toISOString(),
          connection_status: 'CONNECTED'
        });

        this.broadcastToUser(devSocket.userId, 'DEVICE_STATUS', {
          device_id: devSocket.deviceId,
          battery_level: batteryLevel,
          is_charging: isCharging,
          sim_slots: simSlots,
          last_heartbeat_at: new Date().toISOString()
        });

        // Respond with PONG to satisfy keep-alive
        this.sendToDeviceSocket(devSocket.deviceId, {
          event: 'PONG',
          event_id: 'pong_' + crypto.randomUUID(),
          device_id: devSocket.deviceId,
          timestamp: new Date().toISOString(),
          payload: { received_event_id: event_id }
        });
        break;
      }

      case 'COMMAND_ACKNOWLEDGED': {
        const commandId = String(payload?.command_id || '');
        if (commandId) {
          smsQueue.handleCommandAcknowledged(commandId, devSocket.deviceId);
        }
        break;
      }

      case 'SMS_SENT': {
        const messageId = String(payload?.message_id || '');
        const timestamp = typeof payload?.timestamp === 'string' ? payload.timestamp : undefined;
        if (messageId) {
          smsQueue.handleSmsSent(messageId, devSocket.deviceId, timestamp);
        }
        break;
      }

      case 'SMS_DELIVERED': {
        const messageId = String(payload?.message_id || '');
        const timestamp = typeof payload?.timestamp === 'string' ? payload.timestamp : undefined;
        if (messageId) {
          smsQueue.handleSmsDelivered(messageId, devSocket.deviceId, timestamp);
        }
        break;
      }

      case 'SMS_FAILED': {
        const messageId = String(payload?.message_id || '');
        const errorCode = String(payload?.error_code || 'GATEWAY_ERROR');
        const errorMessage = String(payload?.error_message || 'Unknown device error');
        if (messageId) {
          smsQueue.handleSmsFailed(messageId, devSocket.deviceId, errorCode, errorMessage);
        }
        break;
      }

      case 'SMS_RECEIVED': {
        // Inbound SMS received via WebSocket
        const sender = String(payload?.sender || '');
        const messageBody = String(payload?.message_body || '');
        const receivedAt = typeof payload?.received_at === 'string' ? payload.received_at : new Date().toISOString();
        const simSlot = typeof payload?.sim_slot === 'number' ? payload.sim_slot : 0;
        const subscriptionId = typeof payload?.subscription_id === 'number' ? payload.subscription_id : 1;

        if (!sender || !messageBody) break;

        // Idempotency check using event_id
        const existing = dbRepo.getMessageByEventId(event_id);
        if (existing) {
          console.log(`[WS-Device] Duplicate SMS_RECEIVED event_id: ${event_id}. Skipping.`);
          break;
        }

        const msgId = 'msg_' + crypto.randomUUID();
        const device = dbRepo.getDeviceById(devSocket.deviceId);
        const recipientNumber = device?.sim_slots?.[simSlot]?.phone_number || device?.device_name || 'SIM Gateway';

        const smsMsg: SmsMessage = {
          id: msgId,
          user_id: devSocket.userId,
          device_id: devSocket.deviceId,
          direction: 'INBOUND',
          sender,
          recipient: recipientNumber,
          message_body: messageBody,
          status: 'DELIVERED',
          sim_slot: simSlot,
          subscription_id: subscriptionId,
          source_event_id: event_id,
          received_at: receivedAt,
          created_at: receivedAt
        };

        dbRepo.createMessage(smsMsg);

        // Broadcast to user dashboard in real time
        this.broadcastToUser(devSocket.userId, 'SMS_RECEIVED', {
          message_id: msgId,
          device_id: devSocket.deviceId,
          sender,
          recipient: recipientNumber,
          message_body: messageBody,
          sim_slot: simSlot,
          received_at: receivedAt
        });

        // Trigger AI Auto Reply pipeline
        aiService.handleInboundSms(smsMsg);
        break;
      }

      case 'DEVICE_STATUS': {
        const gatewayStatus = payload?.gateway_status as 'IDLE' | 'SENDING' | 'MAINTENANCE' | 'OFFLINE';
        if (gatewayStatus) {
          dbRepo.updateDevice(devSocket.deviceId, {
            gateway_status: gatewayStatus
          });
          this.broadcastToUser(devSocket.userId, 'DEVICE_STATUS', {
            device_id: devSocket.deviceId,
            gateway_status: gatewayStatus
          });
        }
        break;
      }

      default:
        console.log(`[WS-Device] Unhandled event: ${event}`);
    }
  }

  // Dispatch SMS command to connected device
  public dispatchCommandToDevice(deviceId: string, envelope: Record<string, unknown>): boolean {
    const devSock = this.activeDevices.get(deviceId);
    if (!devSock || devSock.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      devSock.ws.send(JSON.stringify(envelope));
      this.logEvent('OUTBOUND', '/device/connect', deviceId, String(envelope.event), envelope);
      return true;
    } catch (err) {
      console.error(`[WS-Device] Error dispatching to device ${deviceId}:`, err);
      return false;
    }
  }

  // Disconnect device remotely
  public disconnectDevice(deviceId: string): boolean {
    const devSock = this.activeDevices.get(deviceId);
    if (devSock && devSock.ws.readyState === WebSocket.OPEN) {
      const eventId = 'evt_' + crypto.randomUUID();
      const envelope = {
        event: 'DEVICE_DISCONNECT',
        event_id: eventId,
        device_id: deviceId,
        timestamp: new Date().toISOString(),
        payload: { reason: 'User requested disconnection from website' }
      };
      devSock.ws.send(JSON.stringify(envelope));
      devSock.ws.close(1000, 'User requested disconnection');
      this.activeDevices.delete(deviceId);
    }

    dbRepo.updateDevice(deviceId, {
      connection_status: 'DISCONNECTED',
      gateway_status: 'OFFLINE'
    });

    return true;
  }

  // Revoke device permanently
  public revokeDevice(deviceId: string): boolean {
    this.disconnectDevice(deviceId);
    dbRepo.revokeDevice(deviceId);
    return true;
  }

  // Broadcast event to website dashboard user sockets
  public broadcastToUser(userId: string, event: string, payload: Record<string, unknown>) {
    const userSockets = this.activeUsers.get(userId);
    if (!userSockets || userSockets.size === 0) return;

    const eventId = 'evt_' + crypto.randomUUID();
    const envelope = {
      event,
      event_id: eventId,
      timestamp: new Date().toISOString(),
      payload
    };

    const serialized = JSON.stringify(envelope);
    for (const u of userSockets) {
      if (u.ws.readyState === WebSocket.OPEN) {
        try {
          u.ws.send(serialized);
          this.logEvent('OUTBOUND', '/user/connect', userId, event, envelope);
        } catch {}
      }
    }
  }

  private sendToUserSocket(userSock: AuthenticatedUserSocket, event: string, payload: Record<string, unknown>) {
    if (userSock.ws.readyState === WebSocket.OPEN) {
      const envelope = {
        event,
        event_id: 'evt_' + crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        payload
      };
      userSock.ws.send(JSON.stringify(envelope));
    }
  }

  private sendToDeviceSocket(deviceId: string, envelope: Record<string, unknown>) {
    const devSock = this.activeDevices.get(deviceId);
    if (devSock && devSock.ws.readyState === WebSocket.OPEN) {
      devSock.ws.send(JSON.stringify(envelope));
      this.logEvent('OUTBOUND', '/device/connect', deviceId, String(envelope.event), envelope);
    }
  }

  private setupHeartbeatSweep() {
    setInterval(() => {
      const now = Date.now();
      // Ping connected devices
      for (const [deviceId, devSock] of this.activeDevices.entries()) {
        if (devSock.ws.readyState === WebSocket.OPEN) {
          const pingEnvelope = {
            event: 'PING',
            event_id: 'ping_' + crypto.randomUUID(),
            device_id: deviceId,
            timestamp: new Date().toISOString(),
            payload: {}
          };
          devSock.ws.send(JSON.stringify(pingEnvelope));
        }

        // Timeout check: if no ping or message in 60s, mark disconnected
        if (now - devSock.lastPing.getTime() > 65000) {
          console.warn(`[WS-Device] Device ${deviceId} heartbeat timed out. Closing socket.`);
          devSock.ws.terminate();
          this.activeDevices.delete(deviceId);
          dbRepo.updateDevice(deviceId, {
            connection_status: 'DISCONNECTED',
            gateway_status: 'OFFLINE'
          });
          this.broadcastToUser(devSock.userId, 'DEVICE_DISCONNECTED', {
            device_id: deviceId,
            timestamp: new Date().toISOString(),
            status: 'DISCONNECTED'
          });
        }
      }
    }, 20000);
  }

  private logEvent(
    direction: 'INBOUND' | 'OUTBOUND',
    endpoint: '/device/connect' | '/user/connect',
    targetId: string,
    event: string,
    payload: unknown
  ) {
    this.eventLogs.unshift({
      id: 'log_' + crypto.randomUUID().slice(0, 8),
      direction,
      endpoint,
      targetId,
      event,
      payload,
      timestamp: new Date().toISOString()
    });
    if (this.eventLogs.length > 200) this.eventLogs.pop();
  }

  public isDeviceConnected(deviceId: string): boolean {
    const dev = this.activeDevices.get(deviceId);
    return Boolean(dev && dev.ws.readyState === WebSocket.OPEN);
  }

  public getConnectedDeviceIds(): string[] {
    return Array.from(this.activeDevices.keys());
  }
}

let wsManagerInstance: WebSocketManager | null = null;

export function initWebSocketManager(server: HttpServer): WebSocketManager {
  if (!wsManagerInstance) {
    wsManagerInstance = new WebSocketManager(server);
  }
  return wsManagerInstance;
}

export function getWebSocketManager(): WebSocketManager {
  if (!wsManagerInstance) {
    throw new Error('WebSocketManager not initialized');
  }
  return wsManagerInstance;
}
