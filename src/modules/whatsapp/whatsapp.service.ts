import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappProvider, UpdateWhatsappSettingsDto } from './dto/whatsapp.dto';
import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState, 
  ConnectionState,
  WASocket,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import * as QRCode from 'qrcode';
import { Boom } from '@hapi/boom';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class WhatsappService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappService.name);
  
  private sessions = new Map<string, WASocket>();
  private qrCodes = new Map<string, string>();
  private statuses = new Map<string, 'DISCONNECTED' | 'CONNECTING' | 'QR' | 'CONNECTED'>();
  
  // Antrian pesan untuk mencegah spam/banned
  private messageQueue: { to: string; message: string; tenantUuid: string | null; priority: boolean }[] = [];
  private isProcessingQueue = false;


  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    this.logger.log('Initializing WhatsApp sessions...');
    const globalSettings = await this.getSettings();
    if (globalSettings.provider === WhatsappProvider.BAILEYS) {
      this.initBaileys();
    }

    const tenantWaSettings = await this.prisma.setting.findMany({
      where: { key: 'WA_PROVIDER', value: WhatsappProvider.BAILEYS },
    });

    for (const setting of tenantWaSettings) {
      this.initBaileys(setting.tenant_uuid);
    }
  }

  async getSettings(tenantUuid?: string | null) {
    if (!tenantUuid) {
      const configs = await this.prisma.globalConfig.findMany({
        where: { key: { startsWith: 'WA_' } },
      });
      return {
        provider: configs.find(c => c.key === 'WA_PROVIDER')?.value as WhatsappProvider || WhatsappProvider.FONNTE,
        fonnte_token: configs.find(c => c.key === 'WA_FONNTE_TOKEN')?.value || '',
      };
    }

    const settings = await this.prisma.setting.findMany({
      where: { tenant_uuid: tenantUuid, key: { startsWith: 'WA_' } },
    });

    return {
      provider: settings.find(s => s.key === 'WA_PROVIDER')?.value as WhatsappProvider || WhatsappProvider.FONNTE,
      fonnte_token: settings.find(s => s.key === 'WA_FONNTE_TOKEN')?.value || '',
    };
  }

  async updateSettings(dto: UpdateWhatsappSettingsDto, tenantUuid?: string | null) {
    const keys = [
      { key: 'WA_PROVIDER', value: dto.provider },
      { key: 'WA_FONNTE_TOKEN', value: dto.fonnte_token || '' },
    ];

    for (const item of keys) {
      if (tenantUuid) {
        await this.prisma.setting.upsert({
          where: { tenant_uuid_key: { tenant_uuid: tenantUuid, key: item.key } },
          update: { value: item.value },
          create: { tenant_uuid: tenantUuid, key: item.key, value: item.value },
        });
      } else {
        await this.prisma.globalConfig.upsert({
          where: { key: item.key },
          update: { value: item.value },
          create: { key: item.key, value: item.value },
        });
      }
    }

    const sessionId = tenantUuid || 'system';
    if (dto.provider === WhatsappProvider.BAILEYS) {
      this.disconnectBaileys(sessionId);
      this.initBaileys(tenantUuid);
    } else {
      this.disconnectBaileys(sessionId);
    }

    return { message: 'Settings updated' };
  }

  getStatus(tenantUuid?: string | null) {
    const sessionId = tenantUuid || 'system';
    return {
      status: this.statuses.get(sessionId) || 'DISCONNECTED',
      qr: this.qrCodes.get(sessionId) || null,
    };
  }

  async initBaileys(tenantUuid?: string | null) {
    const sessionId = tenantUuid || 'system';
    
    try {
      if (this.statuses.get(sessionId) === 'CONNECTED' || this.statuses.get(sessionId) === 'CONNECTING') {
        return;
      }

      this.statuses.set(sessionId, 'CONNECTING');
      
      const sessionsDir = path.resolve(process.cwd(), 'sessions');
      const authFolder = sessionId === 'system' ? 'wa_auth_system' : `wa_auth_tenant_${sessionId}`;
      const authDir = path.join(sessionsDir, authFolder);

      if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });
      if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

      const { state, saveCreds } = await useMultiFileAuthState(authDir);
      
      let version: [number, number, number] = [2, 3000, 1015901307]; // Default fallback version
      try {
        const latest = await fetchLatestBaileysVersion();
        version = latest.version;
      } catch (e) {
        this.logger.warn(`Failed to fetch latest WA version, using fallback: ${version}`);
      }

      const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 5000,
        // Windows fixes
        patchMessageBeforeSending: (message) => {
          const requiresPatch = !!(
            message.buttonsMessage ||
            message.templateMessage ||
            message.listMessage
          );
          if (requiresPatch) {
            message = {
              viewOnceMessage: {
                message: {
                  messageContextInfo: {
                    deviceListMetadata: {},
                    deviceListMetadataVersion: 2
                  },
                  ...message
                }
              }
            };
          }
          return message;
        }
      });

      this.sessions.set(sessionId, sock);

      sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrCodes.set(sessionId, await QRCode.toDataURL(qr));
          this.statuses.set(sessionId, 'QR');
          this.logger.log(`[WA-${sessionId}] QR Code ready for scanning`);
        }

        if (connection === 'close') {
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          
          this.logger.log(`[WA-${sessionId}] Connection closed (${statusCode}), reconnecting in 10s: ${shouldReconnect}`);
          
          this.qrCodes.delete(sessionId);
          this.statuses.set(sessionId, 'DISCONNECTED');
          this.sessions.delete(sessionId);
          
          if (shouldReconnect) {
            setTimeout(() => this.initBaileys(tenantUuid), 10000);
          }
        } else if (connection === 'open') {
          this.logger.log(`[WA-${sessionId}] Connected successfully`);
          this.qrCodes.delete(sessionId);
          this.statuses.set(sessionId, 'CONNECTED');
        }
      });

      sock.ev.on('creds.update', saveCreds);
    } catch (error) {
      this.logger.error(`Failed to init WA for ${sessionId}`, error.stack);
      this.statuses.set(sessionId, 'DISCONNECTED');
      setTimeout(() => this.initBaileys(tenantUuid), 15000);
    }

  }

  private disconnectBaileys(sessionId: string) {
    const sock = this.sessions.get(sessionId);
    if (sock) {
      sock.end(undefined);
      this.sessions.delete(sessionId);
    }
    this.qrCodes.delete(sessionId);
    this.statuses.set(sessionId, 'DISCONNECTED');
  }

  async logoutBaileys(tenantUuid?: string | null) {
    const sessionId = tenantUuid || 'system';
    this.disconnectBaileys(sessionId);
    
    const authFolder = sessionId === 'system' ? 'wa_auth_system' : `wa_auth_tenant_${sessionId}`;
    const authDir = path.join(process.cwd(), 'sessions', authFolder);
    
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }
    
    return { message: 'Logged out' };
  }

  async sendMessage(to: string, message: string, tenantUuid?: string | null, priority = false) {
    // Masukkan ke antrian
    if (priority) {
      this.messageQueue.unshift({ to, message, tenantUuid: tenantUuid || null, priority });
    } else {
      this.messageQueue.push({ to, message, tenantUuid: tenantUuid || null, priority });
    }

    this.logger.log(`Message added to queue for ${to}. Queue size: ${this.messageQueue.length}`);
    
    // Jalankan pengolah antrian jika belum jalan
    if (!this.isProcessingQueue) {
      this.processQueue();
    }
  }

  private async processQueue() {
    if (this.messageQueue.length === 0) {
      this.isProcessingQueue = false;
      return;
    }

    this.isProcessingQueue = true;
    const { to, message, tenantUuid } = this.messageQueue.shift()!;

    try {
      const settings = await this.getSettings(tenantUuid);
      const sessionId = tenantUuid || 'system';

      let target = to.replace(/[^0-9]/g, '');
      if (target.startsWith('08')) target = '628' + target.slice(2);

      if (settings.provider === WhatsappProvider.FONNTE) {
        await this.sendViaFonnte(target, message, settings.fonnte_token);
      } else {
        await this.sendViaBaileys(target, message, sessionId);
      }
      
      this.logger.log(`Message sent to ${to}. Remaining in queue: ${this.messageQueue.length}`);
    } catch (error) {
      this.logger.error(`Failed to send message to ${to}`, error.stack);
    }

    // Jeda acak antara 3 - 6 detik agar tidak terdeteksi bot/spam
    const delay = Math.floor(Math.random() * (6000 - 3000 + 1)) + 3000;
    setTimeout(() => this.processQueue(), delay);
  }

  private async sendViaFonnte(target: string, message: string, token: string) {
    if (!token) return;
    try {
      await fetch('https://api.fonnte.com/send', {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, message }),
      });
    } catch (e) { this.logger.error('Fonnte Error', e); }
  }

  private async sendViaBaileys(target: string, message: string, sessionId: string) {
    const sock = this.sessions.get(sessionId);
    if (!sock || this.statuses.get(sessionId) !== 'CONNECTED') {
      if (!sock) {
        const tenantUuid = sessionId === 'system' ? undefined : sessionId;
        this.initBaileys(tenantUuid);
      }
      this.logger.warn(`WA Session ${sessionId} not ready`);
      return;
    }
    try {
      await sock.sendMessage(`${target}@s.whatsapp.net`, { text: message });
    } catch (e) { this.logger.error(`Baileys Error [${sessionId}]`, e); }
  }
}


