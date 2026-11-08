import crypto from 'crypto';
import { dbRepo, SmsMessage, SmsCommand, Campaign, CampaignRecipient } from '../db/database.js';

// Types for queue jobs
export interface SmsJob {
  messageId: string;
  commandId: string;
  userId: string;
  deviceId: string;
  recipient: string;
  messageBody: string;
  subscriptionId: number;
  simSlot: number;
  idempotencyKey?: string;
  campaignId?: string | null;
  attempts: number;
  maxAttempts: number;
  scheduledAt: number; // timestamp
}

// Memory & Persistent Queue Engine
class SmsQueueEngine {
  private queue: SmsJob[] = [];
  private isProcessing = false;
  private intervalTimer: NodeJS.Timeout | null = null;
  private campaignTimers: Map<string, NodeJS.Timeout> = new Map();

  // Callbacks injected from WebSocket manager
  private dispatchToDeviceCallback?: (deviceId: string, command: Record<string, unknown>) => boolean;
  private broadcastToUserCallback?: (userId: string, eventName: string, payload: Record<string, unknown>) => void;

  constructor() {
    this.startWorker();
  }

  public registerCallbacks(
    dispatchToDevice: (deviceId: string, command: Record<string, unknown>) => boolean,
    broadcastToUser: (userId: string, eventName: string, payload: Record<string, unknown>) => void
  ) {
    this.dispatchToDeviceCallback = dispatchToDevice;
    this.broadcastToUserCallback = broadcastToUser;
  }

  // Enqueue a single message
  public enqueueSms(message: SmsMessage): SmsCommand {
    const commandId = 'cmd_' + crypto.randomUUID();
    const command: SmsCommand = {
      id: commandId,
      device_id: message.device_id,
      message_id: message.id,
      command_type: 'SMS_SEND_COMMAND',
      payload: {
        command_id: commandId,
        message_id: message.id,
        recipient: message.recipient,
        message_body: message.message_body,
        subscription_id: message.subscription_id,
        idempotency_key: message.idempotency_key
      },
      status: 'PENDING',
      attempts: 0,
      acknowledged_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    dbRepo.createCommand(command);

    const job: SmsJob = {
      messageId: message.id,
      commandId: command.id,
      userId: message.user_id,
      deviceId: message.device_id,
      recipient: message.recipient,
      messageBody: message.message_body,
      subscriptionId: message.subscription_id,
      simSlot: message.sim_slot,
      idempotencyKey: message.idempotency_key,
      campaignId: message.campaign_id,
      attempts: 0,
      maxAttempts: 3,
      scheduledAt: Date.now()
    };

    this.queue.push(job);

    // Notify user WS
    this.broadcastToUserCallback?.(message.user_id, 'SMS_QUEUED', {
      message_id: message.id,
      recipient: message.recipient,
      status: 'QUEUED',
      device_id: message.device_id
    });

    // Trigger immediate pass
    setTimeout(() => this.processNextBatch(), 50);

    return command;
  }

  // Triggered when a device connects to drain its pending messages
  public onDeviceConnected(deviceId: string) {
    console.log(`[Queue] Device ${deviceId} connected. Flushing queued messages...`);
    setTimeout(() => this.processNextBatch(), 200);
  }

  private startWorker() {
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.intervalTimer = setInterval(() => {
      this.processNextBatch();
    }, 2000);
    if (this.intervalTimer.unref) {
      this.intervalTimer.unref();
    }
  }

  // Process waiting jobs
  private async processNextBatch() {
    if (this.isProcessing || this.queue.length === 0) return;
    this.isProcessing = true;

    try {
      const now = Date.now();
      const readyJobs = this.queue.filter(j => j.scheduledAt <= now);

      for (const job of readyJobs) {
        const device = dbRepo.getDeviceById(job.deviceId);
        if (!device || device.connection_status !== 'CONNECTED' || device.revoked_at) {
          // Device not online, keep in queue
          continue;
        }

        // Format command strictly conforming to Section 10 Shared WebSocket Event Contract
        const eventId = 'evt_' + crypto.randomUUID();
        const sendEnvelope = {
          event: 'SMS_SEND_COMMAND',
          event_id: eventId,
          device_id: job.deviceId,
          timestamp: new Date().toISOString(),
          payload: {
            command_id: job.commandId,
            message_id: job.messageId,
            recipient: job.recipient,
            message_body: job.messageBody,
            subscription_id: job.subscriptionId,
            idempotency_key: job.idempotencyKey || job.commandId
          }
        };

        const deliveredToSocket = this.dispatchToDeviceCallback?.(job.deviceId, sendEnvelope);
        if (deliveredToSocket) {
          // Remove from in-memory queue
          const idx = this.queue.indexOf(job);
          if (idx !== -1) this.queue.splice(idx, 1);

          // Update command status
          dbRepo.updateCommand(job.commandId, {
            status: 'DISPATCHED',
            attempts: job.attempts + 1
          });

          // Update message status
          dbRepo.updateMessage(job.messageId, {
            status: 'DISPATCHED'
          });

          // Broadcast to website dashboard
          this.broadcastToUserCallback?.(job.userId, 'SMS_DISPATCHED', {
            message_id: job.messageId,
            command_id: job.commandId,
            device_id: job.deviceId,
            recipient: job.recipient,
            status: 'DISPATCHED'
          });
        }
      }
    } catch (err) {
      console.error('[Queue] Error processing batch:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  // Handle command acknowledgment from Android
  public handleCommandAcknowledged(commandId: string, deviceId: string) {
    const cmd = dbRepo.getCommandById(commandId);
    if (!cmd) return;

    dbRepo.updateCommand(commandId, {
      status: 'ACKNOWLEDGED',
      acknowledged_at: new Date().toISOString()
    });

    const msg = dbRepo.getMessageById(cmd.message_id);
    if (msg) {
      this.broadcastToUserCallback?.(msg.user_id, 'COMMAND_ACKNOWLEDGED', {
        command_id: commandId,
        message_id: msg.id,
        device_id: deviceId
      });
    }
  }

  // Handle SMS sent confirmation from Android
  public handleSmsSent(messageId: string, deviceId: string, timestamp?: string) {
    const msg = dbRepo.getMessageById(messageId);
    if (!msg) return;

    const sentAt = timestamp || new Date().toISOString();
    dbRepo.updateMessage(messageId, {
      status: 'SENT',
      sent_at: sentAt
    });

    this.broadcastToUserCallback?.(msg.user_id, 'SMS_SENT', {
      message_id: messageId,
      device_id: deviceId,
      recipient: msg.recipient,
      sent_at: sentAt,
      status: 'SENT'
    });

    // If part of campaign, update campaign counters
    if (msg.campaign_id) {
      this.updateCampaignProgress(msg.campaign_id);
    }
  }

  // Handle SMS delivered report from Android carrier
  public handleSmsDelivered(messageId: string, deviceId: string, timestamp?: string) {
    const msg = dbRepo.getMessageById(messageId);
    if (!msg) return;

    const deliveredAt = timestamp || new Date().toISOString();
    dbRepo.updateMessage(messageId, {
      status: 'DELIVERED',
      delivered_at: deliveredAt
    });

    this.broadcastToUserCallback?.(msg.user_id, 'SMS_DELIVERED', {
      message_id: messageId,
      device_id: deviceId,
      recipient: msg.recipient,
      delivered_at: deliveredAt,
      status: 'DELIVERED'
    });

    if (msg.campaign_id) {
      this.updateCampaignProgress(msg.campaign_id);
    }
  }

  // Handle SMS failed report
  public handleSmsFailed(messageId: string, deviceId: string, errorCode?: string, errorMessage?: string) {
    const msg = dbRepo.getMessageById(messageId);
    if (!msg) return;

    dbRepo.updateMessage(messageId, {
      status: 'FAILED',
      error_code: errorCode || 'GATEWAY_ERROR',
      error_message: errorMessage || 'Message sending failed on Android gateway'
    });

    this.broadcastToUserCallback?.(msg.user_id, 'SMS_FAILED', {
      message_id: messageId,
      device_id: deviceId,
      recipient: msg.recipient,
      error_code: errorCode,
      error_message: errorMessage,
      status: 'FAILED'
    });

    if (msg.campaign_id) {
      this.updateCampaignProgress(msg.campaign_id);
    }
  }

  // Campaign execution manager
  public startCampaign(campaignId: string) {
    const campaign = dbRepo.getCampaignById(campaignId);
    if (!campaign) return false;

    dbRepo.updateCampaign(campaignId, {
      status: 'PROCESSING',
      started_at: campaign.started_at || new Date().toISOString()
    });

    const recipients = dbRepo.getCampaignRecipients(campaignId);
    const pendingRecipients = recipients.filter(r => r.status === 'QUEUED');

    // Interval between sends calculated from rate_limit_per_minute
    const rateLimit = campaign.rate_limit_per_minute || 30;
    const intervalMs = Math.max(1000, Math.floor(60000 / rateLimit));

    let currentIndex = 0;

    const timer = setInterval(() => {
      // Check if paused or cancelled
      const freshCampaign = dbRepo.getCampaignById(campaignId);
      if (!freshCampaign || freshCampaign.status !== 'PROCESSING') {
        clearInterval(timer);
        this.campaignTimers.delete(campaignId);
        return;
      }

      if (currentIndex >= pendingRecipients.length) {
        clearInterval(timer);
        this.campaignTimers.delete(campaignId);
        dbRepo.updateCampaign(campaignId, {
          status: 'COMPLETED',
          completed_at: new Date().toISOString()
        });
        this.broadcastToUserCallback?.(campaign.user_id, 'CAMPAIGN_COMPLETED', {
          campaign_id: campaignId,
          total_recipients: campaign.total_recipients,
          sent_count: freshCampaign.sent_count
        });
        return;
      }

      const rec = pendingRecipients[currentIndex];
      currentIndex++;

      // Check opt-out status for contact
      const contact = dbRepo.getContactByPhone(campaign.user_id, rec.phone_number);
      if (contact && contact.consent_status === 'OPTED_OUT') {
        dbRepo.updateCampaignRecipient(rec.id, {
          status: 'FAILED',
          error_message: 'Recipient has opted out (STOP suppression)'
        });
        return;
      }

      // Format template message with variables like {{name}}
      let body = campaign.message_template;
      body = body.replace(/\{\{\s*name\s*\}\}/gi, rec.recipient_name || 'Customer');

      // Create SMS record
      const msgId = 'msg_' + crypto.randomUUID();
      const smsMsg: SmsMessage = {
        id: msgId,
        user_id: campaign.user_id,
        device_id: campaign.device_id,
        direction: 'OUTBOUND',
        sender: 'Campaign',
        recipient: rec.phone_number,
        message_body: body,
        status: 'QUEUED',
        sim_slot: campaign.sim_slot,
        subscription_id: campaign.subscription_id,
        campaign_id: campaign.id,
        created_at: new Date().toISOString()
      };

      dbRepo.createMessage(smsMsg);
      dbRepo.updateCampaignRecipient(rec.id, {
        message_id: msgId
      });

      // Dispatch to SMS queue
      this.enqueueSms(smsMsg);

    }, intervalMs);

    this.campaignTimers.set(campaignId, timer);
    return true;
  }

  public pauseCampaign(campaignId: string) {
    const timer = this.campaignTimers.get(campaignId);
    if (timer) {
      clearInterval(timer);
      this.campaignTimers.delete(campaignId);
    }
    dbRepo.updateCampaign(campaignId, { status: 'PAUSED' });
    return true;
  }

  public cancelCampaign(campaignId: string) {
    const timer = this.campaignTimers.get(campaignId);
    if (timer) {
      clearInterval(timer);
      this.campaignTimers.delete(campaignId);
    }
    dbRepo.updateCampaign(campaignId, { status: 'CANCELLED' });
    return true;
  }

  private updateCampaignProgress(campaignId: string) {
    const recipients = dbRepo.getCampaignRecipients(campaignId);
    const messages = dbRepo.getRaw().sms_messages.filter(m => m.campaign_id === campaignId);

    const sent = messages.filter(m => m.status === 'SENT' || m.status === 'DELIVERED').length;
    const delivered = messages.filter(m => m.status === 'DELIVERED').length;
    const failed = messages.filter(m => m.status === 'FAILED').length;
    const queued = messages.filter(m => m.status === 'QUEUED' || m.status === 'DISPATCHED').length;

    dbRepo.updateCampaign(campaignId, {
      sent_count: sent,
      delivered_count: delivered,
      failed_count: failed,
      queued_count: queued
    });

    const campaign = dbRepo.getCampaignById(campaignId);
    if (campaign) {
      this.broadcastToUserCallback?.(campaign.user_id, 'CAMPAIGN_PROGRESS', {
        campaign_id: campaignId,
        total: campaign.total_recipients,
        sent,
        delivered,
        failed,
        queued
      });
    }
  }

  public getQueueStats() {
    return {
      waiting_jobs: this.queue.length,
      active_campaigns: this.campaignTimers.size
    };
  }
}

export const smsQueue = new SmsQueueEngine();
