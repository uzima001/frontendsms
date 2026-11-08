import { GoogleGenAI } from '@google/genai';
import crypto from 'crypto';
import { dbRepo, SmsMessage, AiSettings } from '../db/database.js';
import { smsQueue } from './queueService.js';

// Initialize Gemini SDK with User-Agent header as required by skill
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });
  }
  return aiClient;
}

export const aiService = {
  // Test prompt generation without sending real SMS
  async testPrompt(params: {
    systemInstructions: string;
    incomingText: string;
    language?: string;
    maxLength?: number;
  }): Promise<{ reply: string; latencyMs: number }> {
    const startTime = Date.now();
    const maxLength = params.maxLength || 160;

    try {
      const ai = getAiClient();
      const prompt = `INCOMING SMS MESSAGE:
"${params.incomingText}"

INSTRUCTIONS:
You are an SMS auto-responder.
System Instructions: ${params.systemInstructions}
Language: ${params.language || 'English'}
HARD CONSTRAINT: The response will be sent via SMS SIM card. Keep it under ${maxLength} characters. Do not include markdown asterisks, emojis or greetings if it exceeds ${maxLength} chars.

Generate the exact SMS response text only:`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt
      });

      const reply = (response.text || '').trim();
      const latencyMs = Date.now() - startTime;
      return { reply, latencyMs };
    } catch (err: unknown) {
      console.error('[AI] Gemini generation failed:', err);
      const latencyMs = Date.now() - startTime;
      // Graceful fallback for sandbox
      return {
        reply: `Thank you for contacting us. We have received your message and our team will get back to you shortly.`,
        latencyMs
      };
    }
  },

  // Main processing pipeline for incoming SMS
  async handleInboundSms(message: SmsMessage): Promise<void> {
    const userId = message.user_id;
    const settings = dbRepo.getAiSettingsByUserId(userId);

    if (!settings || !settings.enabled) {
      return;
    }

    const senderPhone = message.sender.trim();
    const incomingText = message.message_body.trim();

    // Check opt-out keywords (STOP, UNSUBSCRIBE, END, CANCEL, SITAKI)
    const optOutKeywords = ['STOP', 'UNSUBSCRIBE', 'QUIT', 'END', 'CANCEL', 'SITAKI'];
    const upperText = incomingText.toUpperCase();
    if (optOutKeywords.some(kw => upperText === kw || upperText.startsWith(kw + ' '))) {
      console.log(`[AI] Opt-out keyword detected from ${senderPhone}. Marking contact opted-out.`);
      const existingContact = dbRepo.getContactByPhone(userId, senderPhone);
      if (existingContact) {
        dbRepo.updateContact(existingContact.id, {
          consent_status: 'OPTED_OUT',
          opted_out_at: new Date().toISOString()
        });
      } else {
        dbRepo.createContact({
          id: 'cnt_' + crypto.randomUUID().slice(0, 8),
          user_id: userId,
          name: senderPhone,
          phone_number: senderPhone,
          consent_status: 'OPTED_OUT',
          opted_out_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }

      // Send standard confirmation
      const confirmMsg: SmsMessage = {
        id: 'msg_' + crypto.randomUUID(),
        user_id: userId,
        device_id: message.device_id,
        direction: 'OUTBOUND',
        sender: message.recipient,
        recipient: senderPhone,
        message_body: 'You have been unsubscribed and will receive no further messages. Reply START to re-subscribe.',
        status: 'QUEUED',
        sim_slot: message.sim_slot,
        subscription_id: message.subscription_id,
        created_at: new Date().toISOString()
      };
      dbRepo.createMessage(confirmMsg);
      smsQueue.enqueueSms(confirmMsg);
      return;
    }

    // Safety checks
    // 1. Blocked list
    if (settings.blocked_contacts?.length > 0) {
      if (settings.blocked_contacts.some(b => senderPhone.includes(b))) {
        console.log(`[AI] Sender ${senderPhone} is in blocked contacts. Skipping.`);
        return;
      }
    }

    // 2. Allowed list (if specified)
    if (settings.allowed_contacts?.length > 0) {
      if (!settings.allowed_contacts.some(a => senderPhone.includes(a))) {
        console.log(`[AI] Sender ${senderPhone} not in allowed contacts. Skipping.`);
        return;
      }
    }

    // 3. Daily limit check
    if (settings.daily_used >= settings.daily_limit) {
      console.warn(`[AI] Daily limit reached (${settings.daily_used}/${settings.daily_limit}). Skipping.`);
      return;
    }

    // 4. Anti-loop & Cooldown check
    const conv = dbRepo.getAiConversation(userId, message.device_id, senderPhone);
    const maxConsecutiveReplies = 3;
    if (conv) {
      const lastReplyTime = new Date(conv.last_message_at).getTime();
      const minutesSinceLast = (Date.now() - lastReplyTime) / (1000 * 60);

      // Cooldown reset if time passed
      if (minutesSinceLast > (settings.cooldown_minutes || 15)) {
        dbRepo.upsertAiConversation(userId, message.device_id, senderPhone, 0);
      } else if (conv.automated_reply_count >= maxConsecutiveReplies) {
        console.warn(`[AI Anti-Loop] Maximum automated replies (${maxConsecutiveReplies}) reached for ${senderPhone}. Cooldown active.`);
        return;
      }
    }

    const startTime = Date.now();
    let generatedReply = '';
    let status: 'SUCCESS' | 'WAITING_APPROVAL' | 'FAILED' = 'SUCCESS';
    let errorMessage: string | null = null;

    try {
      const ai = getAiClient();
      const prompt = `You are an automated SMS gateway responder.
System Instructions:
${settings.system_instructions || 'Answer inquiries politely and concisely.'}

Operating Language: ${settings.response_language}
Max response length: ${settings.maximum_response_length} characters.

INCOMING SMS FROM CUSTOMER:
"${incomingText}"

Rules:
1. Provide a direct, helpful, concise answer.
2. Must not exceed ${settings.maximum_response_length} characters.
3. No markdown bolding or bullet points. Plain SMS text only.

Respond with the reply text only:`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt
      });

      generatedReply = (response.text || '').trim();
      if (!generatedReply) {
        generatedReply = settings.fallback_response || 'Thank you for your message. We will contact you soon.';
      }

      // Truncate if model exceeded max length
      if (generatedReply.length > settings.maximum_response_length) {
        generatedReply = generatedReply.slice(0, settings.maximum_response_length);
      }
    } catch (err: unknown) {
      console.error('[AI] Generation error in auto-reply:', err);
      errorMessage = (err as Error).message || 'AI service error';
      generatedReply = settings.fallback_response || 'Thank you for reaching out. We will attend to your request shortly.';
      status = 'FAILED';
    }

    const latencyMs = Date.now() - startTime;

    // Log the AI automation record
    const logId = 'ailog_' + crypto.randomUUID();
    dbRepo.createAiLog({
      id: logId,
      user_id: userId,
      device_id: message.device_id,
      incoming_message_id: message.id,
      phone_number: senderPhone,
      incoming_text: incomingText,
      generated_response: generatedReply,
      status: settings.approval_mode ? 'WAITING_APPROVAL' : status,
      provider: 'gemini',
      model: 'gemini-3.8-flash',
      latency_ms: latencyMs,
      error_message: errorMessage,
      created_at: new Date().toISOString()
    });

    // Update settings daily usage count
    dbRepo.upsertAiSettings({
      ...settings,
      daily_used: settings.daily_used + 1
    });

    // Update conversation automated count
    const currentCount = conv ? conv.automated_reply_count + 1 : 1;
    dbRepo.upsertAiConversation(userId, message.device_id, senderPhone, currentCount);

    // If human approval mode is enabled, wait for dashboard confirmation
    if (settings.approval_mode) {
      console.log(`[AI] Approval mode active for user ${userId}. Reply generated and saved for approval.`);
      return;
    }

    // Delay dispatch if configured (e.g. 2-5 seconds to simulate natural typing)
    const delayMs = (settings.response_delay_seconds || 2) * 1000;

    setTimeout(() => {
      // Create outbound SMS message
      const replyMsgId = 'msg_' + crypto.randomUUID();
      const replyMsg: SmsMessage = {
        id: replyMsgId,
        user_id: userId,
        device_id: message.device_id,
        direction: 'OUTBOUND',
        sender: message.recipient,
        recipient: senderPhone,
        message_body: `[AI] ${generatedReply}`,
        status: 'QUEUED',
        sim_slot: message.sim_slot,
        subscription_id: message.subscription_id,
        idempotency_key: 'idem_ai_' + logId,
        created_at: new Date().toISOString()
      };

      dbRepo.createMessage(replyMsg);
      smsQueue.enqueueSms(replyMsg);
    }, delayMs);
  }
};
