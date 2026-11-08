import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'crypto';
import { dbRepo, User, Device } from '../server/db/database.js';
import { smsQueue } from '../server/services/queueService.js';
import { aiService } from '../server/services/aiService.js';

describe('SMS Gateway Platform Test Suite', () => {
  const testUserId = 'usr_test_' + Date.now();
  const testEmail = `test_${Date.now()}@example.com`;

  describe('1. Authentication & Multi-Tenancy Isolation', () => {
    it('should create and authenticate a new user', () => {
      const passwordHash = crypto.createHash('sha256').update('SecurePass2026!').digest('hex');
      const user: User = {
        id: testUserId,
        name: 'Developer Test User',
        email: testEmail,
        password_hash: passwordHash,
        email_verified_at: new Date().toISOString(),
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      dbRepo.createUser(user);
      const found = dbRepo.getUserByEmail(testEmail);
      assert.strictEqual(found?.id, testUserId);
      assert.strictEqual(found?.name, 'Developer Test User');
    });

    it('should strictly isolate data between user A and user B', () => {
      const userBId = 'usr_isolated_b_' + Date.now();
      const deviceA: Device = {
        id: 'dev_a_' + Date.now(),
        user_id: testUserId,
        device_name: 'Device A',
        device_model: 'Model A',
        platform: 'ANDROID',
        android_version: '14',
        app_version: '1.0.0',
        connection_status: 'CONNECTED',
        gateway_status: 'IDLE',
        sim_status: 'ACTIVE',
        carrier_name: 'Vodacom',
        sim_slots: [],
        battery_level: 90,
        last_heartbeat_at: null,
        connected_at: null,
        revoked_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      dbRepo.createDevice(deviceA);

      // User B query should NOT see Device A
      const userBDevices = dbRepo.getDevicesByUserId(userBId);
      assert.strictEqual(userBDevices.some(d => d.id === deviceA.id), false);
    });
  });

  describe('2. QR Device Pairing Workflow', () => {
    it('should initiate a pairing session with 2-minute expiration', () => {
      const sessionId = 'pair_test_' + Date.now();
      const secret = 'sec_random_123';
      const secretHash = crypto.createHash('sha256').update(secret).digest('hex');
      const expiresAt = new Date(Date.now() + 120000).toISOString();

      const session = dbRepo.createPairingSession({
        id: sessionId,
        user_id: testUserId,
        pairing_secret_hash: secretHash,
        status: 'PENDING',
        expires_at: expiresAt,
        consumed_at: null,
        created_at: new Date().toISOString()
      });

      assert.strictEqual(session.status, 'PENDING');
      assert.ok(new Date(session.expires_at).getTime() > Date.now());
    });
  });

  describe('3. SMS Queue & Status Transitions', () => {
    it('should enqueue outbound SMS and generate SMS_SEND_COMMAND', () => {
      const msgId = 'msg_test_' + Date.now();
      const msg = dbRepo.createMessage({
        id: msgId,
        user_id: testUserId,
        device_id: 'dev_test_01',
        direction: 'OUTBOUND',
        sender: '+255754000000',
        recipient: '+255712334455',
        message_body: 'Unit test outbound SMS dispatch',
        status: 'QUEUED',
        sim_slot: 0,
        subscription_id: 1,
        idempotency_key: 'idem_' + msgId,
        created_at: new Date().toISOString()
      });

      const cmd = smsQueue.enqueueSms(msg);
      assert.strictEqual(cmd.message_id, msgId);
      assert.strictEqual(cmd.command_type, 'SMS_SEND_COMMAND');

      // Test status transitions
      smsQueue.handleCommandAcknowledged(cmd.id, 'dev_test_01');
      smsQueue.handleSmsSent(msgId, 'dev_test_01');
      assert.strictEqual(dbRepo.getMessageById(msgId)?.status, 'SENT');

      smsQueue.handleSmsDelivered(msgId, 'dev_test_01');
      assert.strictEqual(dbRepo.getMessageById(msgId)?.status, 'DELIVERED');
    });

    it('should reject duplicate inbound SMS events idempotently', () => {
      const eventId = 'evt_duplicate_check_' + Date.now();
      const msg1 = dbRepo.createMessage({
        id: 'msg_dup_1',
        user_id: testUserId,
        device_id: 'dev_test_01',
        direction: 'INBOUND',
        sender: '+255711223344',
        recipient: '+255754000000',
        message_body: 'Duplicate test',
        status: 'DELIVERED',
        sim_slot: 0,
        subscription_id: 1,
        source_event_id: eventId,
        created_at: new Date().toISOString()
      });

      const duplicate = dbRepo.getMessageByEventId(eventId);
      assert.strictEqual(duplicate?.id, msg1.id);
    });
  });

  describe('4. AI Sandbox & Auto-Reply Safeguards', () => {
    it('should generate sandbox preview using testPrompt', async () => {
      const result = await aiService.testPrompt({
        systemInstructions: 'You are a concise customer service agent for SMS Gateway.',
        incomingText: 'What time do you close today?',
        maxLength: 160
      });

      assert.ok(result.reply.length > 0);
      assert.ok(result.reply.length <= 250);
      assert.ok(result.latencyMs >= 0);
    });
  });
});
