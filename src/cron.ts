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
import { dbGetTenants, dbSaveEmail, dbSaveDailySummary, dbGetCustomFilters, dbGetDynamicFilters, Tenant } from './services/dbManager';
import { generateBulkSummary } from './services/aiProcessingService';
import { emailQueue } from './config/queue';
import { detectClientFromEmail } from './services/clientDetector';

// Import broadcastEvent dynamically from server to prevent circular dependencies
let broadcastEventFn: ((event: string, data: any) => void) | null = null;

export function registerBroadcaster(fn: (event: string, data: any) => void) {
  broadcastEventFn = fn;
}

let isSyncing = false;

/**
 * FLOW: Generates executive daily bulk summaries for RH/BM management divisions.
 * Can be triggered automatically by cron or manually by user button.
 */
export async function performBulkSummaryForTenants(targetTenantId?: number): Promise<void> {
  try {
    const tenants = await dbGetTenants();
    const bulkTenants = tenants.filter(t => {
      if (targetTenantId) {
        return t.id === targetTenantId;
      }
      return t.feature_bulk_summary;
    });

    if (bulkTenants.length === 0) {
      return;
    }

    console.log(`[Bulk Summary Cron] Processing daily bulk summary for ${bulkTenants.length} tenants (Target ID: ${targetTenantId || 'ALL'})...`);

    for (const tenant of bulkTenants) {
      const emails = await dbGetAllEmails(tenant.id);
      
      // INSTRUKSI 1: TIME CUT-OFF & FILTER
      // 1. Cut-off time: 05:00:00 to 23:59:59
      // 2. Status filter: Unread (!is_read) OR Important (is_important / High urgency)
      const targetDate = new Date();
      const targetDateStr = targetDate.toISOString().split('T')[0];

      let filteredEmails = emails.filter(e => {
        const isStatusMatch = !e.is_read || e.is_important || e.urgency_level === 'High';
        if (!isStatusMatch) return false;

        if (!e.date) return true;
        const eDate = new Date(e.date);
        const eDateStr = eDate.toISOString().split('T')[0];
        const hours = eDate.getUTCHours(); // or local hours
        
        // Strict Cut-off: Target day between 05:00 and 23:59
        const isWithinCutoff = (eDateStr === targetDateStr) && (hours >= 5 && hours <= 23);
        return isWithinCutoff;
      });

      // Fallback if strict cut-off date has no emails (e.g., test environment with mock data)
      if (filteredEmails.length === 0) {
        filteredEmails = emails.filter(e => (!e.is_summarized || !e.is_read || e.is_important));
      }

      if (filteredEmails.length === 0) {
        console.log(`[Bulk Summary Cron] Tenant "${tenant.name}" (ID: ${tenant.id}) has no pending emails for bulk summary.`);
        continue;
      }

      console.log(`[Bulk Summary Cron] Generating Bulk Summary for Tenant "${tenant.name}" (${filteredEmails.length} source emails)...`);
      const summaryContent = await generateBulkSummary(tenant.name, filteredEmails, tenant.ai_primary_model);

      // Collect source email IDs
      const sourceEmailIds = filteredEmails.map(e => e.message_id || String(e.id));

      const summaryDate = targetDateStr;
      await dbSaveDailySummary({
        tenant_id: tenant.id,
        summary_date: summaryDate,
        content_text: summaryContent,
        is_sent_to_wa: false,
        source_email_ids: sourceEmailIds
      });

      // Mark emails as summarized in database
      for (const email of filteredEmails) {
        await dbSaveEmail(email.message_id, {
          ...email,
          tenant_id: tenant.id,
          is_summarized: true
        });
      }

      console.log(`[Bulk Summary Cron] Daily Bulk Summary created for Tenant "${tenant.name}" with ${sourceEmailIds.length} source emails!`);
    }
  } catch (err) {
    console.error('[Bulk Summary Cron] Error running bulk summary generator:', err);
  }
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
    const { dbGetMailConfigs } = await import('./services/dbManager');
    let mailConfigs = await dbGetMailConfigs();
    mailConfigs = mailConfigs.filter(c => c.is_active !== false);

    if (mailConfigs.length === 0) {
      const settings = getAppSettings();
      const { pop3Host, pop3Port, pop3User, pop3Pass } = settings;
      if (pop3Host && pop3User) {
        mailConfigs.push({
          tenant_id: 1,
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

            // Multi-tenant processing & routing based on feature flags
            try {
              let tenants = await dbGetTenants();
              if (!tenants || tenants.length === 0) {
                tenants = [{ id: 1, name: 'COS', ai_primary_model: 'Core', ai_fallback_model: 'Nemotron 3 Super 120B', feature_individual_parsing: true, feature_bulk_summary: false }];
              }

              for (const tenant of tenants) {
                const tenantEmail: Email = {
                  ...newEmail,
                  tenant_id: tenant.id
                };

                if (tenant.feature_individual_parsing) {
                  // COS Division: Save raw email with ai_status PENDING, push to Redis Queue
                  await dbSaveEmail(item.uid, {
                    ...tenantEmail,
                    ai_status: 'PENDING'
                  });

                  try {
                    await emailQueue.add('process-email', {
                      email_id: item.uid,
                      tenant_id: tenant.id
                    });
                    console.log(`[Queue: Added] Email ID ${item.uid} masuk antrean. (Menunggu AI)`);
                  } catch (queueErr: any) {
                    console.error(`[Queue Error] Failed to enqueue Email ID ${item.uid}:`, queueErr.message || queueErr);
                  }
                } else if (tenant.feature_bulk_summary) {
                  // RH/BM Division: Skip individual parsing, queue for Bulk Summary
                  console.log(`[Multi-Tenant Cron] Storing raw email for Bulk Summary for Tenant "${tenant.name}" (${tenant.id}): [${subject}]`);
                  await dbSaveEmail(item.uid, {
                    ...tenantEmail,
                    tenant_id: tenant.id,
                    ai_status: 'SKIPPED_BULK',
                    summary: 'Dijadwalkan untuk Daily Bulk Summary',
                    is_read: false,
                    is_summarized: false
                  });
                }
              }
              accountAddedCount++;
            } catch (apiOrDbErr: any) {
              console.error(`[Cron Sync] Error in Multi-Tenant processing for message #${item.msgNum} (UID: ${item.uid}):`, apiOrDbErr);
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

        // Memory cleanup: trigger GC if available
        if (typeof global !== 'undefined' && (global as any).gc) {
          try {
            (global as any).gc();
          } catch (gcErr) {}
        }
      }

      totalAddedCount += accountAddedCount;
      console.log(`[POP3 Fetcher] ✅ Berhasil menarik ${accountAddedCount} email baru dari ${config.email_address}`);
      await client.sendCommand('QUIT').catch(() => {});
      try { client.close(); } catch (e) {}

    } catch (syncErr: any) {
      console.error(`[POP3 Fetcher] ❌ Gagal login ke akun ${config.email_address}. Error: ${syncErr.message || String(syncErr)}`);
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
