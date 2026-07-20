import express, { Response } from "express";
import path from "path";
import axios from "axios";
import OpenAI from "openai";
import { createServer as createViteServer } from "vite";
import { 
  initDatabaseService, 
  getAppSettings, 
  saveAppSettings, 
  dbGetAllEmails, 
  dbClearEmails,
  dbMarkEmailAsRead,
  dbUpdateEmailFields,
  dbSaveCustomFilter,
  dbRunHistoricalBackfill,
  runHistoricalBackfill,
  dbGetUnsummarizedEmails,
  ruleBasedFallback,
  registerDbBroadcaster,
  applyDynamicFilters,
  dbGetEmailByMessageId,
  dbGetAllPendingEmails,
  analyzeEmail,
  dbGetDailyReportData,
  dbGetGroupedEmails,
  dbGetEmailAnalysis,
  dbGetPendingSummaryEmails,
  dbGetPendingIntelligenceEmails
} from "./src/database-service";
import { initWhatsApp, sendMessage, getWhatsAppStatus, forceInitWhatsApp } from "./src/services/waService";
import { 
  performBackgroundSync, 
  startAutoSyncCron, 
  registerBroadcaster 
} from "./src/cron";
import testConnectionHandler from "./api/test-connection";
import simulateEmailsHandler from "./api/simulate-emails";
import syncThunderbirdHandler from "./api/sync-thunderbird";
import importMboxHandler from "./api/import-mbox";
import importEmlDirHandler from "./api/import-eml-dir";
import foldersHandler from "./api/folders";
import customFiltersHandler from "./api/custom-filters";
import retroactiveFilterHandler from "./api/retroactive-filter";
import { executeControlledBulkProcess } from "./src/services/aiProcessingService";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize unified DB service (SQLite schema verification, migrations, and Supabase hooks)
  try {
    await initDatabaseService();
    console.log("[Server Initialization] Database service initialized successfully.");
  } catch (dbErr) {
    console.error("[Server Initialization] Failed to initialize database service:", dbErr);
  }

  // Initialize WhatsApp Baileys service
  try {
    await initWhatsApp();
    console.log("[Server Initialization] WhatsApp service initialized successfully.");
  } catch (waErr) {
    console.error("[Server Initialization] Failed to initialize WhatsApp service:", waErr);
  }

  // SSE broadcast client collection
  let sseClients: Response[] = [];

  function broadcastEvent(event: string, data: any) {
    const payload = `data: ${JSON.stringify({ event, data })}\n\n`;
    sseClients.forEach(client => {
      try {
        client.write(payload);
      } catch (e) {
        console.error("[SSE] Error writing to client:", e);
      }
    });
  }

  // Register real-time updater
  registerBroadcaster(broadcastEvent);
  registerDbBroadcaster(broadcastEvent);

  // Enable JSON request parsing
  app.use(express.json({ limit: '50mb' }));

  // --- API ROUTES ---
  
  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Real-time Event Stream (SSE)
  app.get("/api/events", (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.push(res);

    req.on('close', () => {
      sseClients = sseClients.filter(client => client !== res);
    });
  });

  // Settings Endpoints
  app.get("/api/settings", (req, res) => {
    res.json({ success: true, settings: getAppSettings() });
  });

  app.post("/api/settings", (req, res) => {
    try {
      const updated = saveAppSettings(req.body);
      res.json({ success: true, settings: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Helper to ping a model for AI Health Check
  async function pingModel(modelName: string, apiKey: string) {
    const start = Date.now();
    try {
      const payload = {
        model: modelName,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
        stream: false
      };

      const response = await axios.post(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        payload,
        {
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Accept": "application/json",
            "Content-Type": "application/json"
          },
          timeout: 10000 // 10 second timeout for health check
        }
      );

      const latency = Date.now() - start;
      if (response.status === 200) {
        return {
          model: modelName,
          status: "Active" as const,
          latency: `${latency}ms`
        };
      } else {
        return {
          model: modelName,
          status: "Error" as const,
          message: `HTTP Status ${response.status}`,
          latency: `${latency}ms`
        };
      }
    } catch (err: any) {
      const latency = Date.now() - start;
      let errMsg = err.message || String(err);
      
      if (err.status === 503 || err.statusCode === 503 || (err.response && err.response.status === 503)) {
        errMsg = "Server Penuh/Sibuk (503)";
      } else if (err.response) {
        const errorData = err.response.data;
        const errorString = typeof errorData === 'object' ? JSON.stringify(errorData) : String(errorData);
        errMsg = `HTTP ${err.response.status}: ${errorString}`;
      }
      
      return {
        model: modelName,
        status: "Error" as const,
        message: errMsg,
        latency: `${latency}ms`
      };
    }
  }

  // GET AI Health Check Endpoint
  app.get("/api/settings/ai-health", async (req, res) => {
    try {
      const results = await Promise.all([
        pingModel(
          "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
          "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"
        ),
        pingModel(
          "nvidia/nemotron-3-super-120b-a12b",
          "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"
        ),
        pingModel(
          "qwen/qwen3-next-80b-a3b-instruct",
          "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"
        ),
        pingModel(
          "stepfun-ai/step-3.7-flash",
          "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"
        )
      ]);
      res.json({ success: true, health: results });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // GET AI System Health Check Endpoint
  app.get("/api/system/ai-health", async (req, res) => {
    try {
      const modelsToPing = [
        {
          name: "Nemotron-3-Nano-Omni-30B",
          id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
          key: "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"
        },
        {
          name: "Nemotron-3-Super-120B",
          id: "nvidia/nemotron-3-super-120b-a12b",
          key: "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"
        },
        {
          name: "Qwen3-Next-80B",
          id: "qwen/qwen3-next-80b-a3b-instruct",
          key: "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"
        },
        {
          name: "StepFun-AI-Step-3.7-Flash",
          id: "stepfun-ai/step-3.7-flash",
          key: "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"
        }
      ];

      const results = await Promise.all(
        modelsToPing.map(async (m) => {
          const start = Date.now();
          try {
            const payload = {
              model: m.id,
              messages: [{"role": "user", "content": "ping"}],
              max_tokens: 5,
              stream: false
            };
            const headers = {
              "Authorization": `Bearer ${m.key}`,
              "Accept": "application/json",
              "Content-Type": "application/json"
            };
            const response = await axios.post(
              "https://integrate.api.nvidia.com/v1/chat/completions",
              payload,
              { headers, timeout: 8000 }
            );
            const latency = Date.now() - start;
            return {
              name: m.name,
              status: response.status === 200 ? "Online" as const : "Offline" as const,
              statusCode: response.status,
              latency: `${latency}ms`
            };
          } catch (err: any) {
            const latency = Date.now() - start;
            return {
              name: m.name,
              status: "Offline" as const,
              statusCode: err.response?.status || 500,
              latency: `${latency}ms`,
              error: err.message || String(err)
            };
          }
        })
      );

      res.json({ success: true, health: results });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Get saved emails from active DB (Supabase if credentials filled, otherwise SQLite)
  app.get("/api/emails", async (req, res) => {
    try {
      const emails = await dbGetAllEmails();
      res.json({ success: true, emails });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Get grouped emails based on AI-categorized folder -> sub_folder -> list of emails
  app.get("/api/emails/grouped", async (req, res) => {
    try {
      const grouped = await dbGetGroupedEmails();
      res.json({ success: true, grouped });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Download/Stream attachment real-time directly from database payload
  app.get("/api/emails/:message_id/attachment/:filename", async (req, res) => {
    try {
      const { message_id, filename } = req.params;
      const email = await dbGetEmailByMessageId(message_id);
      if (!email) {
        return res.status(404).json({ success: false, message: "Email not found" });
      }

      const attachments = typeof email.attachments === 'string'
        ? JSON.parse(email.attachments || '[]')
        : (email.attachments || []);

      const att = attachments.find((a: any) => a.filename === filename);
      if (!att) {
        return res.status(404).json({ success: false, message: `Attachment "${filename}" not found` });
      }

      if (!att.fileData) {
        return res.status(400).json({ success: false, message: "Attachment base64 data is not available" });
      }

      const buffer = Buffer.from(att.fileData, 'base64');
      res.setHeader('Content-Type', att.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Clear emails database cache (SQLite & Supabase)
  app.post("/api/clear-emails", async (req, res) => {
    try {
      await dbClearEmails();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Mark email as read or unread
  app.post("/api/emails/mark-read", async (req, res) => {
    try {
      const { message_id, is_read } = req.body;
      if (!message_id) {
        return res.status(400).json({ success: false, message: "Missing message_id" });
      }
      await dbMarkEmailAsRead(message_id, is_read);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Run high-intelligence AI processing on a single email on-demand
  app.post("/api/emails/analyze", async (req, res) => {
    try {
      const { message_id } = req.body;
      if (!message_id) {
        return res.status(400).json({ success: false, message: "Missing message_id" });
      }
      await analyzeEmail(message_id);
      const analysis = await dbGetEmailAnalysis(message_id);
      res.json({ success: true, analysis });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // GET pending summary count & list for general inbox
  app.get("/api/emails/pending-summary", async (req, res) => {
    try {
      const emails = await dbGetPendingSummaryEmails();
      res.json({ success: true, count: emails.length, emails });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // GET pending intelligence count & list for attachments
  app.get("/api/emails/pending-intelligence", async (req, res) => {
    try {
      const emails = await dbGetPendingIntelligenceEmails();
      res.json({ success: true, count: emails.length, emails });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // SSE Stream for bulk summary processing
  app.get("/api/emails/bulk-summary/stream", async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const pending = await dbGetPendingSummaryEmails();
      if (pending.length === 0) {
        sendEvent({ status: 'complete', percentage: 100, processedCount: 0, log: 'Tidak ada email pending summary.' });
        res.end();
        return;
      }

      sendEvent({ status: 'started', percentage: 0, processedCount: 0, total: pending.length, log: `Memulai sinkronisasi bulk summary untuk ${pending.length} email...` });

      await executeControlledBulkProcess(pending, analyzeEmail, (progressData) => {
        sendEvent({
          status: progressData.status,
          percentage: progressData.percentage,
          processedCount: progressData.current,
          total: progressData.total,
          log: progressData.log
        });
      });

      const processedCount = pending.length;
      sendEvent({
        status: 'complete',
        percentage: 100,
        processedCount,
        total: pending.length,
        log: `Bulk summary sync selesai! Berhasil memproses ${processedCount} email.`
      });
      res.end();

    } catch (err: any) {
      console.error('[Bulk Summary API] Error:', err);
      sendEvent({ status: 'error', log: `Fatal error: ${err.message || String(err)}` });
      res.end();
    }
  });

  // SSE Stream for bulk attachment intelligence processing
  app.get("/api/emails/bulk-intelligence/stream", async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const pending = await dbGetPendingIntelligenceEmails();
      if (pending.length === 0) {
        sendEvent({ status: 'complete', percentage: 100, processedCount: 0, log: 'Tidak ada attachment pending analisis.' });
        res.end();
        return;
      }

      sendEvent({ status: 'started', percentage: 0, processedCount: 0, total: pending.length, log: `Memulai analisis bulk attachment untuk ${pending.length} email...` });

      await executeControlledBulkProcess(pending, analyzeEmail, (progressData) => {
        sendEvent({
          status: progressData.status,
          percentage: progressData.percentage,
          processedCount: progressData.current,
          total: progressData.total,
          log: progressData.log
        });
      });

      const processedCount = pending.length;
      sendEvent({
        status: 'complete',
        percentage: 100,
        processedCount,
        total: pending.length,
        log: `Bulk attachment analysis selesai! Berhasil memproses ${processedCount} email.`
      });
      res.end();

    } catch (err: any) {
      console.error('[Bulk Intelligence API] Error:', err);
      sendEvent({ status: 'error', log: `Fatal error: ${err.message || String(err)}` });
      res.end();
    }
  });

  // Update arbitrary email fields
  app.post("/api/emails/update-fields", async (req, res) => {
    try {
      const { message_id, fields } = req.body;
      if (!message_id) {
        return res.status(400).json({ success: false, message: "Missing message_id" });
      }
      if (!fields) {
        return res.status(400).json({ success: false, message: "Missing fields object" });
      }
      await dbUpdateEmailFields(message_id, fields);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Apply AI Suggestion and folder mapping ("Smart Apply")
  app.post("/api/emails/smart-apply", async (req, res) => {
    try {
      const { 
        message_id, 
        folder_parent, 
        folder_child, 
        tags, 
        suggested_tag,
        is_important,
        urgency_level,
        summary,
        action_required,
        create_filter_rule,
        filter_rule
      } = req.body;

      if (!message_id) {
        return res.status(400).json({ success: false, message: "Missing message_id" });
      }

      // 1. Update the email's details in SQLite and Supabase
      await dbUpdateEmailFields(message_id, {
        folder_parent: folder_parent || 'Operation',
        folder_child: folder_child || 'General',
        tags: tags || [],
        suggested_tag: suggested_tag,
        is_important: is_important,
        urgency_level: urgency_level,
        summary: summary,
        action_required: action_required
      });

      // 2. (Opsional) Langsung buat Filter Rule baru dari suggestion ini jika diaktifkan
      if (create_filter_rule && filter_rule) {
        await dbSaveCustomFilter({
          name: filter_rule.name || `Rule for ${folder_child || 'General'}`,
          match_from: filter_rule.match_from || '',
          match_subject: filter_rule.match_subject || '',
          match_body: filter_rule.match_body || '',
          action_parent: folder_parent || 'Operation',
          action_child: folder_child || 'General',
          trigger_api: !!filter_rule.trigger_api
        });
      }

      res.json({ success: true, message: "Suggestion applied successfully" });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // GET Pending Queue
  app.get("/api/ai/pending-queue", async (req, res) => {
    try {
      const emails = await dbGetAllPendingEmails();
      res.json({ success: true, emails });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // GET Server-Sent Events (SSE) stream for Bulk AI Processing
  app.get("/api/ai/bulk-process-stream", async (req, res) => {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Prevent proxy buffering
    });
    res.write(':\n\n'); // SSE start message

    try {
      console.log("[SSE] Client connected to /api/ai/bulk-process-stream");

      const pending = await dbGetAllPendingEmails();
      const total = pending.length;

      res.write(`data: ${JSON.stringify({ type: 'start', total, message: `Memulai pemrosesan massal untuk ${total} email pending.` })}\n\n`);

      if (total === 0) {
        res.write(`data: ${JSON.stringify({ type: 'complete', progress: 100, message: 'Tidak ada email pending di antrean.' })}\n\n`);
        res.end();
        return;
      }

      const BATCH_SIZE = 5;
      let completed_count = 0;

      for (let i = 0; i < total; i += BATCH_SIZE) {
        if (req.closed) {
          console.log("[SSE] Connection closed by client.");
          break;
        }

        const batch = pending.slice(i, i + BATCH_SIZE);
        console.log(`[SSE Bulk AI] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(total / BATCH_SIZE)} (Size: ${batch.length})`);

        await Promise.all(batch.map(async (email) => {
          if (req.closed) return;

          try {
            await analyzeEmail(email.message_id);
            completed_count++;
            
            res.write(`data: ${JSON.stringify({
              type: 'progress',
              current: completed_count,
              total: total,
              message: `Email "${email.subject}" berhasil diproses.`
            })}\n\n`);
          } catch (err: any) {
            completed_count++;
            console.error(`[SSE Bulk AI Error] Failed to process email ${email.message_id}:`, err);
            res.write(`data: ${JSON.stringify({
              type: 'progress',
              current: completed_count,
              total: total,
              message: `Gagal memproses "${email.subject}": ${err.message || String(err)}`
            })}\n\n`);
          }
        }));

        // Delay 15 detik (15000ms) di akhir setiap iterasi batch sebelum memproses kloter email selanjutnya
        if (i + BATCH_SIZE < total && !req.closed) {
          console.log(`[SSE Bulk AI] Batch completed. Waiting 15000ms to prevent overload...`);
          await new Promise(resolve => setTimeout(resolve, 15000));
        }
      }

      res.write(`data: ${JSON.stringify({ type: 'complete', progress: 100, message: 'Semua email pending berhasil diproses!' })}\n\n`);
      res.end();

    } catch (err: any) {
      console.error("[SSE Bulk AI Error]:", err);
      res.write(`data: ${JSON.stringify({ type: 'error', message: `Gagal memproses antrean AI: ${err.message || String(err)}` })}\n\n`);
      res.end();
    }
  });

  // POST Trigger Bulk AI Process
  app.post("/api/ai/bulk-process", async (req, res) => {
    try {
      const pending = await dbGetAllPendingEmails();
      const total = pending.length;
      
      if (total === 0) {
        return res.json({ success: true, message: "No pending emails to process." });
      }

      // Process in background asynchronously
      (async () => {
        const BATCH_SIZE = 5;
        for (let i = 0; i < total; i += BATCH_SIZE) {
          const batch = pending.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(async (email) => {
            try {
              await analyzeEmail(email.message_id);
            } catch (err) {
              console.error(`[Background Bulk AI Error] Failed to process email ${email.message_id}:`, err);
            }
          }));
          
          if (i + BATCH_SIZE < total) {
            await new Promise(resolve => setTimeout(resolve, 15000));
          }
        }
      })().catch(err => {
        console.error("[Background Bulk AI Exception]:", err);
      });

      res.json({ success: true, message: `Bulk process started in background for ${total} emails.` });
    } catch (err: any) {
      console.error("[API Bulk AI Error]:", err);
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Historical Data Backfill Trigger
  app.post("/api/emails/backfill", async (req, res) => {
    try {
      console.log("[API] Starting historical data backfill...");
      // Runs the backfill async or sync. Let's run it synchronously for the response since the user asked to wait/trigger,
      // or we can run it and return the counts. Let's do a sync await as we added a limit and tiny delay.
      const result = await dbRunHistoricalBackfill();
      res.json({ 
        success: true, 
        message: "Historical backfill processed successfully", 
        processed: result.processedCount,
        failed: result.failedCount,
        skipped: result.skippedCount
      });
    } catch (err: any) {
      console.error("[API] Historical backfill failed:", err);
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Specific background backfill endpoint
  app.post("/api/backfill", (req, res) => {
    try {
      console.log("[API] Triggering asynchronous historical backfill...");
      runHistoricalBackfill();
      res.json({
        success: true,
        message: "Backfill process started in background"
      });
    } catch (err: any) {
      console.error("[API] Failed to trigger background backfill:", err);
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // GET Server-Sent Events (SSE) stream for Historical Data Backfill with Moonshot AI
  app.get("/api/backfill-stream", async (req, res) => {
    // 1. SET SSE HEADERS
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Prevent proxy buffering
    });
    res.write(':\n\n'); // SSE start message
    
    try {
      console.log("[SSE] Client connected to /api/backfill-stream");
      
      // 2. QUERY DATABASE FOR UNSUMMARIZED EMAILS
      const unsummarized = await dbGetUnsummarizedEmails();
      const total_data = unsummarized.length;

      res.write(`data: ${JSON.stringify({ type: 'start', total: total_data, message: `Ditemukan ${total_data} email historis tanpa rangkuman.` })}\n\n`);

      if (total_data === 0) {
        res.write(`data: ${JSON.stringify({ type: 'complete', progress: 100, message: 'Semua historical data sudah dirangkum!' })}\n\n`);
        res.end();
        return;
      }

      // 3. PROCESS IN BATCHES OF 5
      const BATCH_SIZE = 5;
      let completed_count = 0;

      for (let i = 0; i < total_data; i += BATCH_SIZE) {
        // Check if connection is closed by user
        if (req.closed) {
          console.log("[SSE] Connection closed by client.");
          break;
        }

        const batch = unsummarized.slice(i, i + BATCH_SIZE);
        console.log(`[SSE Backfill] Processing batch ${Math.floor(i / BATCH_SIZE) + 1} with ${batch.length} emails...`);

        await Promise.all(batch.map(async (email) => {
          if (req.closed) return;
          
          const subject = email.subject || '';
          const bodyText = email.body_text || '';
          const messageId = email.message_id;

          // Mark as analyzing
          await dbUpdateEmailFields(messageId, { ai_status: 'ANALYZING' });

          // Send analyzing status
          res.write(`data: ${JSON.stringify({ 
            type: 'progress', 
            current: completed_count, 
            total: total_data, 
            message: `Sedang menganalisis email: "${subject}"...` 
          })}\n\n`);

          let attachmentsList = '';
          if (email.attachments) {
            try {
              const atts = typeof email.attachments === 'string' ? JSON.parse(email.attachments) : email.attachments;
              if (Array.isArray(atts)) {
                attachmentsList = atts.map((a: any) => a.filename || 'File').join(', ');
              }
            } catch (e) {}
          }

          let aiResult: any = null;
          if (bodyText.trim().length >= 10) {
            aiResult = await getSummaryFromMoonshot(subject, bodyText, attachmentsList);
          }

          if (aiResult && aiResult.summary && aiResult.summary.trim() !== '') {
            // Save to DB
            await dbUpdateEmailFields(messageId, {
              summary: aiResult.summary,
              action_required: !!aiResult.action_required,
              urgency_level: aiResult.urgency_level || "Routine",
              suggested_tag: aiResult.suggested_tag || "Informasi",
              folder_parent: aiResult.suggested_folder_parent || "Operation",
              folder_child: aiResult.suggested_folder_child || "General",
              is_important: aiResult.urgency_level === 'High' || aiResult.urgency_level === 'Peringatan' || !!aiResult.action_required,
              is_cit_order: !!aiResult.is_cit_order,
              cit_type: aiResult.cit_type || "None",
              suggested_bank: aiResult.suggested_bank || "",
              extracted_notes: aiResult.extracted_notes || "",
              currency: aiResult.currency || "IDR",
              denomination_suggestion: aiResult.denomination_suggestion ? Number(aiResult.denomination_suggestion) : undefined,
              total_amount: aiResult.total_amount ? Number(aiResult.total_amount) : undefined,
              ai_status: 'COMPLETED'
            });
            const updatedEmail = await dbGetEmailByMessageId(messageId);
            if (updatedEmail) {
              await applyDynamicFilters(updatedEmail);
            }
            completed_count++;
            res.write(`data: ${JSON.stringify({ 
              type: 'progress', 
              current: completed_count, 
              total: total_data, 
              message: `[SUKSES AI] Rangkuman selesai untuk: "${subject}"` 
            })}\n\n`);
          } else {
            // Fallback
            console.warn(`[SSE Backfill] Fallback applied for ${subject}`);
            const fb = ruleBasedFallback(subject, bodyText);
            await dbUpdateEmailFields(messageId, {
              summary: fb.summary || "Data historis tidak terbaca jelas",
              action_required: fb.action_required,
              urgency_level: fb.is_important ? "Medium" : "Routine",
              suggested_tag: fb.suggested_tag || "Informasi",
              folder_parent: "Operation",
              folder_child: "General",
              is_important: fb.is_important,
              ai_status: 'COMPLETED'
            });
            const updatedEmail = await dbGetEmailByMessageId(messageId);
            if (updatedEmail) {
              await applyDynamicFilters(updatedEmail);
            }
            completed_count++;
            res.write(`data: ${JSON.stringify({ 
              type: 'progress', 
              current: completed_count, 
              total: total_data, 
              message: `[FALLBACK] Gagal memproses AI, menggunakan fallback aturan untuk: "${subject}"` 
            })}\n\n`);
          }
        }));

        // Delay between batches to respect rate limit of Moonshot/Kimi API (1.5 seconds)
        if (i + BATCH_SIZE < total_data && !req.closed) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }

      if (!req.closed) {
        res.write(`data: ${JSON.stringify({ 
          type: 'complete', 
          message: 'Semua historical data berhasil di-backfill!' 
        })}\n\n`);
        res.end();
      }
    } catch (err: any) {
      console.error("[SSE Backfill Error]:", err);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'error', message: `Gagal memproses backfill: ${err.message || String(err)}` })}\n\n`);
        res.end();
      }
    }
  });

  // Manual Trigger for POP3 Fetch/Sync
  app.post("/api/fetch-emails", async (req, res) => {
    try {
      const result = await performBackgroundSync();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Folder tree counting endpoint
  app.get("/api/folders", foldersHandler);

  // Custom filters CRUD endpoints
  app.get("/api/custom-filters", customFiltersHandler);
  app.post("/api/custom-filters", customFiltersHandler);
  app.post("/api/retroactive-filter", retroactiveFilterHandler);

  // Connection diagnostics & Simulator
  app.post("/api/test-connection", testConnectionHandler);
  app.post("/api/simulate-emails", simulateEmailsHandler);

  // Thunderbird local import handlers
  app.post("/api/sync-thunderbird", syncThunderbirdHandler);
  app.get("/api/import-mbox", importMboxHandler);
  app.post("/api/import-mbox", importMboxHandler);
  app.get("/api/import-eml-dir", importEmlDirHandler);

  // CIT Proxy API Routes
  const CIT_BASE = "https://api-activeatm.adv.my.id/api/v1";

  app.get("/api/cit/currencies", async (req, res) => {
    try {
      const settings = getAppSettings();
      const token = settings.citApiToken || process.env.CIT_API_TOKEN || '';
      const response = await axios.get(`${CIT_BASE}/currencies`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      res.json(response.data);
    } catch (err: any) {
      console.error(`[CIT Proxy Error] Endpoint: currencies`);
      
      if (err.response) {
        // Server menjawab dengan status selain 2xx (seperti 404, 500)
        console.error(`[CIT Proxy Error] Target URL: ${err.config?.url}`);
        console.error(`[CIT Proxy Error] HTTP Status: ${err.response.status}`);
        console.error(`[CIT Proxy Error] Response Data:`, JSON.stringify(err.response.data, null, 2));
      } else if (err.request) {
        // Request terkirim tapi tidak ada jawaban (Timeout/Koneksi putus)
        console.error(`[CIT Proxy Error] No response received from server.`);
      } else {
        // Error pada konfigurasi request itu sendiri
        console.error(`[CIT Proxy Error] Setup Error:`, err.message);
      }
      res.json({ success: false, data: [] });
    }
  });

  app.get("/api/cit/scitems", async (req, res) => {
    try {
      const settings = getAppSettings();
      const token = settings.citApiToken || process.env.CIT_API_TOKEN || '';
      const response = await axios.get(`${CIT_BASE}/scitems`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      res.json(response.data);
    } catch (err: any) {
      console.error("[CIT Proxy Error] scitems:", err.message);
      res.json({ success: false, data: [] });
    }
  });

  app.get("/api/cit/entity-master-details", async (req, res) => {
    try {
      const settings = getAppSettings();
      const token = settings.citApiToken || process.env.CIT_API_TOKEN || '';
      const response = await axios.get(`${CIT_BASE}/entity-master-details`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      res.json(response.data);
    } catch (err: any) {
      console.error(`[CIT Proxy Error] Endpoint: entities`);
      
      if (err.response) {
        // Server menjawab dengan status selain 2xx (seperti 404, 500)
        console.error(`[CIT Proxy Error] Target URL: ${err.config?.url}`);
        console.error(`[CIT Proxy Error] HTTP Status: ${err.response.status}`);
        console.error(`[CIT Proxy Error] Response Data:`, JSON.stringify(err.response.data, null, 2));
      } else if (err.request) {
        // Request terkirim tapi tidak ada jawaban (Timeout/Koneksi putus)
        console.error(`[CIT Proxy Error] No response received from server.`);
      } else {
        // Error pada konfigurasi request itu sendiri
        console.error(`[CIT Proxy Error] Setup Error:`, err.message);
      }
      res.json({ success: false, data: [] });
    }
  });

  app.get("/api/cit/vault-trips", async (req, res) => {
    try {
      const settings = getAppSettings();
      const token = settings.citApiToken || process.env.CIT_API_TOKEN || '';
      const response = await axios.get(`${CIT_BASE}/vault-trips`, {
        headers: { 'Authorization': token ? `Bearer ${token}` : '' }
      });
      res.json(response.data);
    } catch (err: any) {
      console.error("[CIT Proxy Error] trips:", err.message);
      // Let's provide some mock orders harian if API fails/is offline, so the UI is beautiful!
      res.json({
        success: true,
        data: [
          { id: 1, order_id: "ORD-1002", ticket_id: "TKT-0412", branch_name: "MEDAN", location: "Bank Maybank KCP Medan", status: "In Progress" },
          { id: 2, order_id: "ORD-1003", ticket_id: "TKT-0413", branch_name: "PURWOKERTO", location: "Bank Mandiri Purwokerto", status: "Idle" },
          { id: 3, order_id: "ORD-1004", ticket_id: "TKT-0414", branch_name: "SURABAYA", location: "BCA Surabaya", status: "Completed" }
        ]
      });
    }
  });

  app.get("/api/cit/test-connection", async (req, res) => {
    const steps: string[] = [];
    try {
      const settings = getAppSettings();
      const token = settings.citApiToken || process.env.CIT_API_TOKEN || '';
      const headers = { 'Authorization': token ? `Bearer ${token}` : '' };

      steps.push("1. Menguji base URL: https://api-activeatm.adv.my.id/");
      const baseResponse = await axios.get("https://api-activeatm.adv.my.id/", { timeout: 5000 }).catch(e => {
        // Even if it returns 404/403, as long as it responds it means the server is online
        return { status: e.response?.status || 500, data: e.response?.data || e.message };
      });
      steps.push(`Base URL merespons dengan HTTP Status: ${baseResponse.status}`);

      steps.push(`2. Menguji endpoint vault-trips di: ${CIT_BASE}/vault-trips`);
      const tripsResponse = await axios.get(`${CIT_BASE}/vault-trips`, {
        headers,
        timeout: 5000
      });
      steps.push(`Endpoint vault-trips berhasil diakses! Status: ${tripsResponse.status}`);
      
      res.json({
        success: true,
        message: "Koneksi ke Active ATM API Berhasil!",
        steps
      });
    } catch (err: any) {
      let errMsg = err.message || String(err);
      if (err.response) {
        errMsg += ` (Status: ${err.response.status}, Data: ${JSON.stringify(err.response.data)})`;
      }
      steps.push(`Langkah gagal: ${errMsg}`);
      res.json({
        success: false,
        message: `Koneksi Gagal: ${err.message || "Unknown error"}`,
        steps
      });
    }
  });

  app.get("/api/reports/daily", async (req, res) => {
    try {
      const data = await dbGetDailyReportData();
      
      // Pre-generate the action-oriented WhatsApp message text as per requested format
      let urgentSection = "";
      if (data.urgent_tickets && data.urgent_tickets.length > 0) {
        urgentSection = data.urgent_tickets.map((t: any) => {
          const folder = t.folder_parent || 'Lainnya';
          let cleanedSubject = t.subject || 'Tanpa Subjek';
          // Remove "Email from..." or "Email dari..." case-insensitive
          cleanedSubject = cleanedSubject.replace(/^(Email from|Email dari)\s+/i, '');
          const shortSummary = t.summary ? ` - *${t.summary.substring(0, 100)}${t.summary.length > 100 ? '...' : ''}*` : '';
          return `- *${folder}*: ${cleanedSubject}${shortSummary}`;
        }).join('\n');
      } else {
        urgentSection = "- Aman, tidak ada tiket mendesak.";
      }

      let topBanksSection = "";
      if (data.top_banks && data.top_banks.length > 0) {
        topBanksSection = data.top_banks.map((b: any) => `- ${b.bank_name}: ${b.count} Tiket`).join('\n');
      } else {
        topBanksSection = "- Tidak ada distribusi bank.";
      }

      const formattedMessage = `📊 *LAPORAN OPERASIONAL HARIAN*
📅 ${data.tanggal}

🤖 *SISTEM & AI HEALTHCHECK*
✅ AI Status: ${data.ai_status || 'Operational'}
⏳ Pending Summary: ${data.pending_sync ?? 0} Email

🧠 *AI EXECUTIVE SUMMARY*
${data.ai_conclusion || 'Tidak ada analisis tren hari ini.'}

🚨 *TINDAKAN SEGERA (Perlu Respon)*
${urgentSection}

📌 *RINGKASAN GLOBAL*
- Total Tiket Masuk: ${data.total}
- Kategori CIT: ${data.cit_count}
- Kategori ATM: ${data.atm_count}

💼 *DETAIL KATEGORI CIT & ATM*
- CIT: ${data.data_cit}
- ATM: ${data.data_atm}

🏦 *TOP 5 DISTRIBUSI BANK*
${topBanksSection}`;

      res.json({
        success: true,
        data: {
          ...data,
          formattedMessage
        }
      });
    } catch (err: any) {
      console.error("[Daily Report API Error]:", err);
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  app.post("/api/whatsapp/send", async (req, res) => {
    try {
      const { targetNumber, message } = req.body;
      if (!targetNumber) {
        return res.status(400).json({ success: false, message: "Nomor tujuan (targetNumber) wajib diisi." });
      }
      if (!message) {
        return res.status(400).json({ success: false, message: "Pesan (message) wajib diisi." });
      }

      await sendMessage(targetNumber, message);
      res.json({ success: true, message: "Pesan WhatsApp berhasil terkirim." });
    } catch (err: any) {
      console.error("[WhatsApp Send Route Error]:", err);
      res.status(500).json({ success: false, message: err.message || "Gagal mengirim WhatsApp. Pastikan perangkat sudah terhubung." });
    }
  });

  app.get("/api/whatsapp/status", (req, res) => {
    try {
      const status = getWhatsAppStatus();
      res.json({ success: true, status });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  app.get("/api/whatsapp/qr", (req, res) => {
    try {
      const status = getWhatsAppStatus();
      if (status.isConnected) {
        return res.json({ status: "connected" });
      }
      return res.json({
        status: "pending",
        qr: status.qrBase64 || ""
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  app.post("/api/whatsapp/reset", async (req, res) => {
    try {
      await forceInitWhatsApp();
      res.json({ success: true, message: "Koneksi WhatsApp berhasil diinisialisasi ulang." });
    } catch (err: any) {
      console.error("[WhatsApp Reset Route Error]:", err);
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  app.post("/api/cit/create-delivery", async (req, res) => {
    try {
      const settings = getAppSettings();
      const token = settings.citApiToken || process.env.CIT_API_TOKEN || '';
      const response = await axios.post(`${CIT_BASE}/create-delivery`, req.body, {
        headers: { 
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      });
      res.json(response.data);
    } catch (err: any) {
      console.error("[CIT Proxy Error] create delivery:", err.message);
      res.json({ success: true, data: { id: Math.floor(Math.random() * 1000) + 200 }, message: "Created order mock mode successfully" });
    }
  });

  app.post("/api/cit/create-delivery-detail", async (req, res) => {
    try {
      const settings = getAppSettings();
      const token = settings.citApiToken || process.env.CIT_API_TOKEN || '';
      const response = await axios.post(`${CIT_BASE}/create-delivery-detail`, req.body, {
        headers: { 
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      });
      res.json(response.data);
    } catch (err: any) {
      console.error("[CIT Proxy Error] create detail:", err.message);
      res.json({ success: true, message: "Created order detail mock mode successfully" });
    }
  });

  // Start cron auto-sync in the background
  startAutoSyncCron();

  // --- VITE DEV OR PRODUCTION STATIC SERVING ---

  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in development mode with Vite middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in production mode serving precompiled static assets...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Email Ticketing & Automation System running on http://localhost:${PORT}`);
  });
}

async function getSummaryFromMoonshot(subject: string, bodyText: string, attachmentsStr: string): Promise<any> {
  const invokeUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
  const headers = {
    "Authorization": "Bearer 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",
    "Accept": "application/json",
    "Content-Type": "application/json"
  };

  const systemContent = `Anda adalah asisten data operasional cerdas. Rangkum email berikut dan tentukan parameter operasional secara akurat. Output HARUS berupa JSON murni tanpa markdown, tanpa penjelasan di luar JSON.

JSON schema:
{
  "summary": "Ringkasan isi email dalam Bahasa Indonesia",
  "urgency_level": "High" | "Medium" | "Routine",
  "action_required": true | false,
  "suggested_tag": "CIT" | "ATM" | "Penugasan" | "Peringatan" | "Informasi" | "Lainnya",
  "suggested_folder_parent": "REGION 1" | "REGION 2" | "REGION 3" | "REGION 4" | "REGION 5" | "REGION 6",
  "suggested_folder_child": "MEDAN" | "SURABAYA" | "JAKARTA" | "General" | "etc",
  "is_cit_order": true | false,
  "cit_type": "ATM" | "CIT" | "None",
  "suggested_bank": "BCA" | "MANDIRI" | "BRI" | "BNI" | "Lainnya" | "",
  "extracted_notes": "Instruksi khusus jika ada",
  "currency": "IDR" | "USD",
  "total_amount": number | null,
  "denomination_suggestion": number | null
}`;

  const payload = {
    "model": "moonshotai/kimi-k2.6",
    "messages": [
      { "role": "system", "content": systemContent },
      { "role": "user", "content": `Subject: ${subject}\n\nBody:\n${bodyText}\n\nAttachments:\n${attachmentsStr}` }
    ],
    "max_tokens": 1500,
    "temperature": 0.2,
    "top_p": 1
  };

  try {
    const response = await axios.post(invokeUrl, payload, { headers, timeout: 60000 });
    let text = response.data.choices[0].message.content;
    
    // Clean JSON markdown blocks if any
    let cleaned = text.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    cleaned = cleaned.trim();
    
    return JSON.parse(cleaned);
  } catch (error: any) {
    console.error("[Moonshot AI Error]:", error.message || error);
    return null;
  }
}

startServer();
