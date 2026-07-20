import makeWASocket, { useMultiFileAuthState, DisconnectReason, WASocket } from '@whiskeysockets/baileys';
import pino from 'pino';
import path from 'path';
import fs from 'fs';
import qrcodeTerminal from 'qrcode-terminal';
import { toDataURL } from 'qrcode';

let sock: WASocket | null = null;
let isConnected = false;
let isConnecting = false;
let reconnectTimeout: NodeJS.Timeout | null = null;
let qrCodeString = '';
let latestQrBase64 = '';

export function getWhatsAppStatus() {
  return {
    isConnected,
    isConnecting,
    qrCode: qrCodeString,
    qrBase64: latestQrBase64,
  };
}

export async function forceInitWhatsApp(): Promise<void> {
  console.log('[WhatsApp] Menghubungkan ulang / Refresh QR...');
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  if (sock) {
    try {
      sock.end(undefined);
    } catch (e) {}
    sock = null;
  }
  isConnected = false;
  isConnecting = false;
  qrCodeString = '';
  latestQrBase64 = '';

  const authFolder = path.join(process.cwd(), 'auth_info');
  if (fs.existsSync(authFolder)) {
    try {
      const files = fs.readdirSync(authFolder);
      for (const file of files) {
        fs.unlinkSync(path.join(authFolder, file));
      }
    } catch (e) {
      console.error('[WhatsApp] Gagal menghapus file sesi lama:', e);
    }
  }

  await initWhatsApp();
}

export async function initWhatsApp(): Promise<void> {
  if (isConnecting) {
    console.log('[WhatsApp] Koneksi / inisialisasi sedang berjalan... Mengabaikan panggilan ganda.');
    return;
  }
  isConnecting = true;

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

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCodeString = qr;
      try {
        latestQrBase64 = await toDataURL(qr);
      } catch (err) {
        console.error('[WhatsApp] Gagal mengonversi QR ke Base64:', err);
      }
      console.log('\n==================================================');
      console.log('🚨 SILAKAN SCAN QR CODE BERIKUT UNTUK LOGIN WHATSAPP:');
      console.log('==================================================\n');
      qrcodeTerminal.generate(qr, { small: true });
      console.log('\n==================================================\n');
    }

    if (connection === 'close') {
      isConnected = false;
      isConnecting = false;
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const errorMsg = (lastDisconnect?.error as any)?.message || '';
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      console.log(`[WhatsApp] Koneksi terputus. Status Code: ${statusCode}. Message: ${errorMsg}. Reconnect: ${shouldReconnect}`);
      
      if (shouldReconnect) {
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
        }
        
        // Jeda 10000ms (10 detik) jika connectionClosed atau status 428, jika tidak gunakan 8000ms
        const delay = (statusCode === 428 || statusCode === DisconnectReason.connectionClosed) ? 10000 : 8000;
        console.log(`[WhatsApp] Menjadwalkan koneksi ulang dalam ${delay}ms...`);
        
        reconnectTimeout = setTimeout(() => {
          initWhatsApp().catch((err) => console.error('[WhatsApp] Reconnect error:', err));
        }, delay);
      } else {
        console.log('[WhatsApp] Sesi logged out. Silakan scan ulang.');
        sock = null;
        qrCodeString = '';
        latestQrBase64 = '';
      }
    } else if (connection === 'open') {
      isConnected = true;
      isConnecting = false;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      qrCodeString = '';
      latestQrBase64 = '';
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
