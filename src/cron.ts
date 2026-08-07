/**
 * =========================================================================
 * CRON SCHEDULER & POP3 EMAIL FETCHER SERVICE
 * =========================================================================
 * 
 * WORKFLOW 1: POP3 Fetcher Cron Job (Setiap 1 Menit)
 * 1. Berjalan otomatis setiap 1 menit via node-cron.
 * 2. Menghubungkan ke server POP3 sesuai kredensial tenant.
 * 3. Menarik email baru, mem-parsing header/body, dan mencocokkan dengan Custom Filters.
 * 4. Menyimpan data email mentah ke PostgreSQL dengan status `ai_status = 'PENDING'`.
 * 5. Mendorong payload { email_id, tenant_id } ke Redis BullMQ Queue (`email-ai-queue`) untuk diproses asinkron oleh Worker AI.
 * 
 * WORKFLOW 2: Daily Bulk Summary Cron Job (Setiap Jam 17:00)
 * 1. Berjalan independen sekali sehari pukul 17:00 WIB / sore.
 * 2. Mengambil seluruh email masuk milik tenant dengan feature_bulk_summary = TRUE (seperti divisi RH & BM).
 * 3. Menghasilkan ringkasan eksekutif harian menggunakan LLM Engine.
 * 4. Menyimpan hasil rangkuman ke tabel `daily_summaries` untuk dikirim via WhatsApp Gateway.
 */

import cron from 'node-cron';
import { simpleParser } from 'mailparser';
import { Pop3Client, parsePop3Message } from './pop3';
import { 
  getAppSettings, 
  dbGetAllEmails, 
  dbUpsertEmail, 
  Email,
  dbCheckExistingUids
} from './database-service';
import { triggerCitApiWorkflow } from './cit-api-service';
import { dbGetTenants, dbSaveEmail, dbSaveDailySummary, dbGetCustomFilters, dbGetDynamicFilters, Tenant, DailySummary } from './services/dbManager';
import { generateDailySummary } from './services/aiProcessingService';
import { emailQueue, pushTenantLog } from './config/queue';
import { detectClientFromEmail } from './services/clientDetector';

// Import broadcastEvent dynamically from server to prevent circular dependencies
let broadcastEventFn: ((event: string, data: any) => void) | null = null;

export function registerBroadcaster(fn: (event: string, data: any) => void) {
  broadcastEventFn = fn;
}

let isSyncing = false;
const pop3RetryAfter = new Map<string, number>();
const POP3_AUTH_RETRY_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * FLOW: Generates executive daily bulk summaries for RH/BM management divisions.
 * Can be triggered automatically by cron or manually by user button.
 */
export async function performBulkSummaryForTenants(targetTenantId?: number): Promise<DailySummary[]> {
  const createdSummaries: DailySummary[] = [];
  try {
    const tenants = await dbGetTenants();
    let bulkTenants = tenants.filter(t => {
      if (targetTenantId) {
        return t.id === targetTenantId;
      }
      return t.feature_bulk_summary;
    });

    if (targetTenantId && bulkTenants.length === 0) {
      const specificTenant = tenants.find(t => t.id === targetTenantId);
      if (specificTenant) {
        bulkTenants = [specificTenant];
      }
    }

    if (bulkTenants.length === 0) {
      return [];
    }

    console.log(`[Bulk Summary Cron] Processing daily bulk summary for ${bulkTenants.length} tenants (Target ID: ${targetTenantId || 'ALL'})...`);

    for (const tenant of bulkTenants) {
      try {
        console.log(`[Bulk Summary Cron] Generating Bulk Summary for Tenant "${tenant.name}" (ID: ${tenant.id})...`);
        const saved = await generateDailySummary(tenant.id);
        
        createdSummaries.push(saved);
        console.log(`[Bulk Summary Cron] Daily Bulk Summary created for Tenant "${tenant.name}"!`);
      } catch (err: any) {
        console.log(`[Bulk Summary Cron] Skipped Tenant "${tenant.name}" (ID: ${tenant.id}): ${err.message}`);
      }
    }
  } catch (err) {
    console.error('[Bulk Summary Cron] Error running bulk summary generator:', err);
  }

  return createdSummaries;
}

/**
 * FLOW: POP3 Email Fetcher
 * Reads incoming mail via POP3, saves to DB with ai_status='PENDING', and pushes job to BullMQ Queue.
 */
export async function performBackgroundSync(): Promise<{ success: boolean; count: number; message: string }> {

  if (isSyncing) {
    console.log('[Cron Sync] Sync already in progress, skipping...');
    return { success: false, count: 0, message: 'Sync already in progress' };
  }

  isSyncing = true;
  console.log(`\n=== [BACKGROUND POP3 AUTO-SYNC START] ===`);

  try {
    const { dbGetMailConfigs, dbGetTenants } = await import('./services/dbManager');
    let mailConfigs = await dbGetMailConfigs();
    mailConfigs = mailConfigs.filter(c => c.is_active !== false);

    // Include POP3 configs from tenants table if configured and not yet in mailConfigs
    try {
      const tenants = await dbGetTenants();
      for (const tenant of tenants) {
        if (tenant.pop3_host && tenant.pop3_user) {
          const exists = mailConfigs.some(c => c.username === tenant.pop3_user || c.email_address === tenant.pop3_user);
          if (!exists) {
            mailConfigs.push({
              tenant_id: tenant.id,
              email_address: tenant.pop3_user,
              host: tenant.pop3_host,
              port: tenant.pop3_port || 995,
              username: tenant.pop3_user,
              password: tenant.pop3_pass || '',
              is_active: true
            });
          }
        }
      }
    } catch (tenantErr) {
      console.warn('[Cron Sync] Warning gathering tenant mail configs:', tenantErr);
    }

    // Always include Super Admin / Global POP3 settings from AppSettings if configured
    const settings = getAppSettings();
    const { pop3Host, pop3Port, pop3User, pop3Pass } = settings;
    if (pop3Host && pop3User) {
      const exists = mailConfigs.some(c => c.username === pop3User || c.email_address === pop3User);
      if (!exists) {
        mailConfigs.push({
          tenant_id: 1, // Default Super Admin / COS Tenant ID
          email_address: pop3User,
          host: pop3Host,
          port: pop3Port || 995,
          username: pop3User,
          password: pop3Pass || '',
          is_active: true
        });
      }
    }

    if (mailConfigs.length === 0) {
      console.warn('[Cron Sync] No active mail configurations found. Skipping background sync.');
      isSyncing = false;
      return { success: false, count: 0, message: 'No active mail configurations' };
    }

    let totalAddedCount = 0;

    for (const config of mailConfigs) {
      const accountKey = `${config.host}:${config.port || 995}:${config.username}`;
      const retryAfter = pop3RetryAfter.get(accountKey) || 0;
      if (retryAfter > Date.now()) {
        const retryMinutes = Math.max(1, Math.ceil((retryAfter - Date.now()) / 60000));
        console.warn(`[POP3 Fetcher] Skipping ${config.email_address}; authentication retry available in ${retryMinutes} minute(s).`);
        continue;
      }
      console.log(`[POP3 Fetcher] 🔄 Memulai sinkronisasi untuk akun: ${config.email_address} (Tenant ID: ${config.tenant_id || 1})`);
      const client = new Pop3Client();
      let accountAddedCount = 0;

      try {
        const port = config.port || 995;
        const greeting = await client.connect(config.host, port);

        // USER & PASS Authentications
        await client.sendCommand(`USER ${config.username}`);
        const authRes = await client.sendCommand(`PASS ${config.password}`);
        if (!authRes.startsWith('+OK')) {
          throw new Error(`POP3 Authentication failed: ${authRes.trim()}`);
        }
      console.log('[Cron Sync] POP3 Authentication successful.');
      pop3RetryAfter.delete(accountKey);

      // UIDL Command to get message IDs
      const uidlRes = await client.sendCommand('UIDL', true);
      if (!uidlRes.startsWith('+OK')) {
        throw new Error(`UIDL command error: ${uidlRes.trim()}`);
      }

      const lines = uidlRes.split(/\r?\n/);
      if (lines[0].startsWith('+OK')) {
        lines.shift();
      }

      const emailItems: { msgNum: number; uid: string }[] = [];
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const msgNum = parseInt(parts[0], 10);
          const uid = parts[1];
          if (!isNaN(msgNum) && uid) {
            emailItems.push({ msgNum, uid });
          }
        }
      }

      console.log(`[Cron Sync] Server reports ${emailItems.length} total messages.`);

      // Highly optimized bulk check of existing messages using .in() query
      const serverUids = emailItems.map(item => item.uid);
      const existingMessageIds = await dbCheckExistingUids(serverUids);

      // Check which ones are new
      const newItems = emailItems.filter(item => !existingMessageIds.has(item.uid));
      console.log(`[Cron Sync] Found ${newItems.length} new messages to fetch.`);

      const BATCH_SIZE = 50;

      // 1. Fetch Phase (Sequential raw POP3 RETR and simpleParser)
      const fetchedEmails: Array<{
        item: { msgNum: number; uid: string };
        parsed: any;
        subject: string;
        dateStr: string;
        senderStr: string;
        receiverStr: string;
        bodyText: string;
        htmlBody: string;
        parsedAttachments: any[];
      }> = [];

      console.log(`[Cron Sync] Downloading and parsing ${newItems.length} emails from POP3 server...`);
      for (const item of newItems) {
        try {
          console.log(`[Cron Sync] Fetching message #${item.msgNum} (UID: ${item.uid})...`);
          const retrRes = await client.sendCommand(`RETR ${item.msgNum}`, true);
          const rawEmail = parsePop3Message(retrRes);

          // Parse with mailparser
          const parsed = await simpleParser(rawEmail);

          const subject = parsed.subject || '(No Subject)';
          const dateStr = parsed.date ? parsed.date.toISOString() : new Date().toISOString();
          
          const fromVal = (parsed.from as any)?.value?.[0] || (parsed.from as any)?.[0] || {};
          const senderStr = fromVal.name 
            ? `${fromVal.name} <${fromVal.address}>` 
            : (fromVal.address || 'Unknown Sender');

          // FILTER SPAM EASYGO
          if (subject.toLowerCase().includes('easygo') || senderStr.toLowerCase().includes('easygo')) {
            console.log(`[Cron Sync] Skipping easygo spam email: Subject="${subject}", Sender="${senderStr}"`);
            continue;
          }

          const toVal = (parsed.to as any)?.value?.[0] || (parsed.to as any)?.[0] || {};
          const receiverStr = toVal.address || 'fachrul.wisnu@advantagescm.com';

          const bodyText = parsed.text || '';
          const htmlBody = parsed.textAsHtml || parsed.html || '';

          const parsedAttachments = (parsed.attachments || []).map((att: any) => {
            let fileData: string | null = null;
            const size = att.size || (att.content ? att.content.length : 0);
            if (att.content) {
              if (size <= 3 * 1024 * 1024) { // 3MB limit
                fileData = Buffer.isBuffer(att.content)
                  ? att.content.toString('base64')
                  : Buffer.from(att.content).toString('base64');
              } else {
                console.log(`[Cron Sync] Skipped Base64 storage for ${att.filename || 'Attachment'} because its size (${size} bytes) exceeds 3MB limit.`);
              }
            }
            return {
              filename: att.filename || 'Attachment',
              contentType: att.contentType || '',
              size: size,
              fileData: fileData
            };
          });

          fetchedEmails.push({
            item,
            parsed,
            subject,
            dateStr,
            senderStr,
            receiverStr,
            bodyText,
            htmlBody,
            parsedAttachments
          });
        } catch (emailErr: any) {
          console.error(`[Cron Sync] Failed to fetch/parse message #${item.msgNum} (UID: ${item.uid}):`, emailErr);
        }
      }

      console.log(`[Cron Sync] Downloaded ${fetchedEmails.length} messages. Commencing Parallel AI Processing (Batch Size: 5)...`);

      // 2. Parallel Processing Phase (AI + Supabase/SQLite in batches of 5)
      const PROCESS_BATCH_SIZE = 5;
      for (let i = 0; i < fetchedEmails.length; i += PROCESS_BATCH_SIZE) {
        const batch = fetchedEmails.slice(i, i + PROCESS_BATCH_SIZE);
        console.log(`[Cron Sync] Processing AI batch ${Math.floor(i / PROCESS_BATCH_SIZE) + 1}/${Math.ceil(fetchedEmails.length / PROCESS_BATCH_SIZE)} (Items ${i + 1} to ${Math.min(i + PROCESS_BATCH_SIZE, fetchedEmails.length)} of ${fetchedEmails.length})...`);

        const queueJobs = [];
        await Promise.all(batch.map(async (emailJob) => {
          const { item, parsed, subject, dateStr, senderStr, receiverStr, bodyText, htmlBody, parsedAttachments } = emailJob;
          try {
            // Determine tags
            const tags: string[] = [];
            const subjUpper = subject.toUpperCase();
            if (subjUpper.includes('SPEEDTEST')) tags.push('Speedtest');
            if (subjUpper.includes('APPROVAL')) tags.push('Approval');
            if (subjUpper.includes('UAT')) tags.push('UAT');
            if (subjUpper.includes('FSD')) tags.push('FSD');
            if (subjUpper.includes('SIT')) tags.push('SIT');
            if (tags.length === 0) tags.push('Other');

            // Match custom filters with logic AND on filled fields
            let matchedFolderParent = '';
            let matchedFolderChild = '';
            let triggerApiWorkflow = false;

            // Smart Client Auto-Detection (BCA, BNI, Mandiri, Danamon, etc)
            const autoDetectedBank = detectClientFromEmail(senderStr, subject, bodyText);

            // Dynamic Filters matching (Region & Branch) - Isolated per tenant
            const dynamicFiltersList = await dbGetDynamicFilters(config.tenant_id || 1);
            for (const df of dynamicFiltersList) {
              const emailsArr = df.emails.split(',').map(e => e.trim().toLowerCase());
              if (emailsArr.some(e => e && senderStr.toLowerCase().includes(e))) {
                if (!matchedFolderParent) matchedFolderParent = 'Bank Order';
                if (!matchedFolderChild) matchedFolderChild = df.branch;
                break;
              }
            }

            // Match custom filters with logic AND on filled fields
            const filters = await dbGetCustomFilters();
            for (const filter of filters) {
              if (!filter.match_from && !filter.match_subject && !filter.match_body) {
                continue;
              }
              let isMatch = true;
              
              if (filter.match_from && filter.match_from.trim()) {
                const terms = filter.match_from.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
                const matchFromSuccess = terms.some(term => {
                  if (!term) return false;
                  if (senderStr.toLowerCase().includes(term)) return true;
                  if (senderStr.length > 3 && term.includes(senderStr.toLowerCase())) return true;
                  return false;
                });
                if (!matchFromSuccess) isMatch = false;
              }

              if (isMatch && filter.match_subject && filter.match_subject.trim()) {
                const terms = filter.match_subject.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
                const matchSubjSuccess = terms.some(term => term && subject.toLowerCase().includes(term));
                if (!matchSubjSuccess) isMatch = false;
              }

              if (isMatch && filter.match_body && filter.match_body.trim()) {
                const terms = filter.match_body.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
                const matchBodySuccess = terms.some(term => term && bodyText.toLowerCase().includes(term));
                if (!matchBodySuccess) isMatch = false;
              }

              if (isMatch) {
                matchedFolderParent = filter.action_parent;
                matchedFolderChild = filter.action_child;
                triggerApiWorkflow = !!filter.trigger_api;
                break;
              }
            }

            // Trigger CIT API Automation Workflow if matched parent is 'Bank Order' or trigger_api is true
            let apiWorkflowStatus = 'none';
            let apiWorkflowLog = '';

            if (matchedFolderParent === 'Bank Order' || triggerApiWorkflow) {
              apiWorkflowStatus = 'pending';
              console.log(`[Cron Sync] Triggering CIT API Workflow for Bank Order: "${subject}"`);
              try {
                const workflowResult = await triggerCitApiWorkflow(item.uid, subject, bodyText);
                apiWorkflowStatus = workflowResult.success ? 'triggered' : 'failed';
                apiWorkflowLog = workflowResult.log;
              } catch (wfErr: any) {
                apiWorkflowStatus = 'failed';
                apiWorkflowLog = `CIT API Automation Exception: ${wfErr.message || String(wfErr)}`;
              }
            }

            const newEmail: Email = {
              message_id: item.uid,
              source_email: receiverStr || '',
              subject,
              sender: senderStr,
              receiver: receiverStr,
              date: dateStr,
              body_text: bodyText,
              html_body: htmlBody,
              tags,
              folder_parent: matchedFolderParent || undefined,
              folder_child: matchedFolderChild || undefined,
              suggested_bank: autoDetectedBank || undefined,
              api_workflow_status: apiWorkflowStatus,
              api_workflow_log: apiWorkflowLog,
              attachments: parsedAttachments
            };

            // Multi-tenant processing & routing based on config tenant ID
            try {
              const targetTenantId = config.tenant_id || 1;
              const tenantEmail: Email = {
                ...newEmail,
                tenant_id: targetTenantId
              };

              await dbSaveEmail(item.uid, {
                ...tenantEmail,
                ai_status: 'PENDING'
              });

              queueJobs.push({ uid: item.uid, tenantId: targetTenantId });

              accountAddedCount++;
            } catch (apiOrDbErr: any) {
              console.error(`[Cron Sync] Error in email processing for message #${item.msgNum} (UID: ${item.uid}):`, apiOrDbErr);
              return;
            }

            // Broadcast to React frontend in real-time
            if (broadcastEventFn) {
              broadcastEventFn('email_synced', {
                email: {
                  ...newEmail,
                  fromName: parsed.from?.value[0]?.name || parsed.from?.value[0]?.address || 'Unknown Sender',
                  fromAddress: parsed.from?.value[0]?.address || '',
                  body: bodyText,
                  bodyHtml: htmlBody,
                  folderParent: newEmail.folder_parent,
                  folderChild: newEmail.folder_child
                },
                message: `New email synced: "${subject}" tagged as "${newEmail.folder_parent || 'Lainnya'} > ${newEmail.folder_child || 'Uncategorized'}"`
              });
            }
          } catch (jobErr: any) {
            console.error(`[Cron Sync] Error processing AI/DB job for message #${item.msgNum} (UID: ${item.uid}):`, jobErr);
          }
        }));

        // Wait for DB commit
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        for (const qJob of queueJobs) {
            try {
                await emailQueue.add('process-email', {
                  messageId: qJob.uid,
                  tenantId: qJob.tenantId,
                  email_id: qJob.uid,
                  tenant_id: qJob.tenantId
                }, {
                  delay: 1500,
                  attempts: 5,
                  backoff: { type: 'fixed', delay: 2000 }
                });
                console.log(`[Queue: Added] Email messageId ${qJob.uid} masuk antrean dengan delay 1.5s (Tenant ID: ${qJob.tenantId}).`);
            } catch (queueErr) {
                console.error(`[Queue Error] Failed to enqueue Email ID ${qJob.uid}:`, queueErr.message || queueErr);
            }
        }

        // Memory cleanup: trigger GC if available
        if (typeof global !== 'undefined' && (global as any).gc) {
          try {
            (global as any).gc();
          } catch (gcErr) {}
        }
      }

      totalAddedCount += accountAddedCount;
      console.log(`[POP3 Fetcher] ✅ Berhasil menarik ${accountAddedCount} email baru dari ${config.email_address}`);
      await pushTenantLog(config.tenant_id || 1, `[SyncPOP3] Connected to ${config.email_address}. Synced ${accountAddedCount} new emails.`, 'SUCCESS', 100, 'SyncPOP3').catch(() => {});
      await client.sendCommand('QUIT').catch(() => {});
      try { client.close(); } catch (e) {}

    } catch (syncErr: any) {
      const syncErrorMessage = syncErr.message || String(syncErr);
      if (/authorization failed|authentication failed|USER command rejected|PASS command rejected/i.test(syncErrorMessage)) {
        pop3RetryAfter.set(accountKey, Date.now() + POP3_AUTH_RETRY_COOLDOWN_MS);
      }
      const tenantId = config.tenant_id || 1;
      console.warn(`[POP3 Fetcher] ⚠️ Connection/Authentication warning for ${config.email_address}: ${syncErrorMessage}`);
      await pushTenantLog(tenantId, `[SyncPOP3 Warning] ${config.email_address}: ${syncErrorMessage}`, 'ERROR', 100, 'SyncPOP3').catch(() => {});
      try { client.close(); } catch (e) {}
    }
  }

  return { success: true, count: totalAddedCount, message: `Synced ${totalAddedCount} new emails across configurations.` };
  } catch (err: any) {
    console.error('[Cron Sync] Critical error in sync workflow:', err);
    return { success: false, count: 0, message: `Critical error: ${err.message || String(err)}` };
  } finally {
    isSyncing = false;
    console.log(`=== [BACKGROUND POP3 AUTO-SYNC END] ===\n`);
  }
}

// Start cron job every 1 minute for POP3 fetcher & separate daily schedule for Bulk Summary
export function startAutoSyncCron() {
  console.log('[Cron] Initializing auto-sync cron job (every 1 minute: "*/1 * * * *")...');
  
  // Trigger initial background sync 3 seconds after server start
  setTimeout(() => {
    performBackgroundSync().catch(err => console.error('[POP3 Cron] Initial sync error:', err));
  }, 3000);

  cron.schedule('*/1 * * * *', async () => {
    console.log('[Cron] Triggering POP3 background auto-sync...');
    await performBackgroundSync();
  });

  // Daily Bulk Summary scheduled independently at 17:00
  console.log('[Cron] Initializing daily bulk summary schedule (everyday at 17:00)...');
  cron.schedule('0 17 * * *', async () => {
    console.log('[Cron] Triggering Daily Bulk Summary Execution...');
    await performBulkSummaryForTenants();
  });
}
