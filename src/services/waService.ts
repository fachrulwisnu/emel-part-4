import makeWASocket, { useMultiFileAuthState, DisconnectReason, WASocket } from '@whiskeysockets/baileys';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import qrcodeTerminal from 'qrcode-terminal';

let sock: WASocket | null = null;
let isConnected = false;
let qrCodeString = '';

export function getWhatsAppStatus() {
  return {
    isConnected,
    qrCode: qrCodeString,
  };
}

export async function initWhatsApp(): Promise<void> {
  const authFolder = path.join(process.cwd(), 'auth_info');
  
  // Ensure the directory exists
  if (!fs.existsSync(authFolder)) {
    fs.mkdirSync(authFolder, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(authFolder);

  console.log('[WhatsApp] Menghubungkan ke WhatsApp...');

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false, // We'll handle console output ourselves
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCodeString = qr;
      console.log('\n==================================================');
      console.log('🚨 SILAKAN SCAN QR CODE BERIKUT UNTUK LOGIN WHATSAPP:');
      console.log('==================================================\n');
      qrcodeTerminal.generate(qr, { small: true });
      console.log('\n==================================================\n');
    }

    if (connection === 'close') {
      isConnected = false;
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log(`[WhatsApp] Koneksi terputus. Status Code: ${statusCode}. Reconnect: ${shouldReconnect}`);
      
      if (shouldReconnect) {
        // Delay reconnect to avoid infinite loop spam
        setTimeout(() => {
          initWhatsApp().catch((err) => console.error('[WhatsApp] Reconnect error:', err));
        }, 5000);
      } else {
        console.log('[WhatsApp] Sesi logged out. Silakan scan ulang.');
        sock = null;
        qrCodeString = '';
      }
    } else if (connection === 'open') {
      isConnected = true;
      qrCodeString = '';
      console.log('==================================================');
      console.log('✅ WHATSAPP BERHASIL TERHUBUNG!');
      console.log('==================================================');
    }
  });
}

export async function sendMessage(phone: string, text: string): Promise<{ success: boolean }> {
  if (!sock || !isConnected) {
    throw new Error('WhatsApp belum terhubung');
  }

  // Format phone number to WhatsApp JID format
  // Sanitize the phone number to keep only digits
  let sanitizedPhone = phone.replace(/[^0-9]/g, '');
  
  // Handle leading '0' or '+62' formatting
  if (sanitizedPhone.startsWith('0')) {
    sanitizedPhone = '62' + sanitizedPhone.slice(1);
  } else if (sanitizedPhone.startsWith('62')) {
    // Keep as is
  } else if (sanitizedPhone.length > 0 && !sanitizedPhone.startsWith('62')) {
    // If it doesn't have 62 or 0, default prepend 62 or keep as is. Let's prepend 62 if it looks like a local phone number starting with e.g. 8...
    if (sanitizedPhone.startsWith('8')) {
      sanitizedPhone = '62' + sanitizedPhone;
    }
  }

  const jid = `${sanitizedPhone}@s.whatsapp.net`;

  try {
    await sock.sendMessage(jid, { text });
    console.log(`[WhatsApp] Pesan berhasil dikirim ke ${jid}`);
    return { success: true };
  } catch (err: any) {
    console.error(`[WhatsApp] Gagal mengirim pesan ke ${jid}:`, err);
    throw new Error(`Gagal mengirim WhatsApp: ${err.message || String(err)}`);
  }
}
