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
  dbGetPendingIntelligenceEmails,
  dbBackfillFolders
} from "./src/database-service";
import { initWhatsApp, sendMessage, getWhatsAppStatus, forceInitWhatsApp } from "./src/services/waService";
import { 
  performBackgroundSync, 
  startAutoSyncCron, 
  registerBroadcaster 
} from "./src/cron";
import "./src/workers/aiWorker";
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

  app.get("/api/config/database", async (req, res) => {
    try {
      const { getDatabaseConfig } = await import("./src/utils/configManager.js");
      const config = await getDatabaseConfig();
      res.json({ success: true, config });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/config/database", async (req, res) => {
    try {
      const { saveDatabaseConfig } = await import("./src/utils/configManager.js");
      const { active_driver, connections } = req.body;
      if (active_driver && active_driver !== 'mongodb' && active_driver !== 'postgres') {
        return res.status(400).json({ success: false, message: "Invalid active_driver. Must be 'mongodb' or 'postgres'." });
      }
      const updatedConfig = await saveDatabaseConfig({ active_driver, connections });
      res.json({ success: true, config: updatedConfig });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get("/api/settings/db-driver", async (req, res) => {
    try {
      const { getDatabaseConfig } = await import("./src/utils/configManager.js");
      const config = await getDatabaseConfig();
      res.json({ success: true, dbDriver: config.active_driver });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post("/api/settings/db-driver", async (req, res) => {
    try {
      const { saveDatabaseConfig } = await import("./src/utils/configManager.js");
      const { dbDriver } = req.body;
      if (dbDriver !== 'postgres' && dbDriver !== 'mongodb') {
        return res.status(400).json({ success: false, message: "Invalid dbDriver value. Must be 'mongodb' or 'postgres'." });
      }
      const updated = await saveDatabaseConfig({ active_driver: dbDriver });
      res.json({ success: true, dbDriver: updated.active_driver });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Helper to ping a model for AI Health Check
  async function pingModel(modelName: string, apiKey: string) {
    const start = Date.now();
    try {
      if (modelName === "Gemini Flash Latest" || modelName.toLowerCase().includes("gemini")) {
        const key = apiKey || process.env.GEMINI_API_KEY || '';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${encodeURIComponent(key)}`;
        const response = await axios.post(
          url,
          { contents: [{ parts: [{ text: "ping" }] }] },
          { headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key }, timeout: 10000 }
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
      } else if (modelName.startsWith("Custom AI")) {
        const response = await axios.get(
          "https://aim.adv.my.id/v1/models",
          {
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Accept": "application/json"
            },
            timeout: 8000
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
      } else {
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
        pingModel("Gemini Flash Latest", process.env.GEMINI_API_KEY || ""),
        pingModel("Custom AI - Core", "sk-WYKkPR_QQ6LTbnGWyIxPZA"),
        pingModel("Custom AI - Vision", "sk-WYKkPR_QQ6LTbnGWyIxPZA"),
        pingModel(
          "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
          "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"
        ),
        pingModel(
          "nvidia/nemotron-3-super-120b-a12b",
          "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"
        ),
        pingModel(
          "openai/gpt-oss-120b",
          process.env.chatgpt_NVDIA_KEY || process.env.chatgpt_NVIDIA_KEY || process.env.NVIDIA_API_KEY || ""
        ),
        pingModel(
          "nvidia/nemotron-3-ultra-550b-a55b",
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
          name: "Gemini-Flash-Latest",
          type: "gemini",
          key: process.env.GEMINI_API_KEY || ""
        },
        {
          name: "Custom AI - Core",
          type: "custom",
          url: "https://aim.adv.my.id/v1/models",
          key: "sk-WYKkPR_QQ6LTbnGWyIxPZA"
        },
        {
          name: "Custom AI - Vision",
          type: "custom",
          url: "https://aim.adv.my.id/v1/models",
          key: "sk-WYKkPR_QQ6LTbnGWyIxPZA"
        },
        {
          name: "Nemotron-3-Nano-Omni-30B",
          type: "nvidia",
          id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
          key: "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"
        },
        {
          name: "Nemotron-3-Super-120B",
          type: "nvidia",
          id: "nvidia/nemotron-3-super-120b-a12b",
          key: "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"
        },
        {
          name: "OpenAI-GPT-OSS-120B",
          type: "nvidia",
          id: "openai/gpt-oss-120b",
          key: process.env.chatgpt_NVDIA_KEY || process.env.chatgpt_NVIDIA_KEY || process.env.NVIDIA_API_KEY || ""
        },
        {
          name: "Nemotron-3-Ultra-550B",
          type: "nvidia",
          id: "nvidia/nemotron-3-ultra-550b-a55b",
          key: "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"
        },
        {
          name: "StepFun-AI-Step-3.7-Flash",
          type: "nvidia",
          id: "stepfun-ai/step-3.7-flash",
          key: "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"
        }
      ];

      const results = await Promise.all(
        modelsToPing.map(async (m) => {
          const start = Date.now();
          try {
            if (m.type === "gemini") {
              const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${encodeURIComponent(m.key)}`;
              const response = await axios.post(
                url,
                { contents: [{ parts: [{ text: "ping" }] }] },
                { headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
              );
              const latency = Date.now() - start;
              return {
                name: m.name,
                status: response.status === 200 ? ("Online" as const) : ("Offline" as const),
                statusCode: response.status,
                latency: `${latency}ms`
              };
            } else if (m.type === "custom") {
              const response = await axios.get(m.url, {
                headers: {
                  "Authorization": `Bearer ${m.key}`,
                  "Accept": "application/json"
                },
                timeout: 8000
              });
              const latency = Date.now() - start;
              return {
                name: m.name,
                status: response.status === 200 ? ("Online" as const) : ("Offline" as const),
                statusCode: response.status,
                latency: `${latency}ms`
              };
            } else {
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
                status: response.status === 200 ? ("Online" as const) : ("Offline" as const),
                statusCode: response.status,
                latency: `${latency}ms`
              };
            }
          } catch (err: any) {
            const latency = Date.now() - start;
            let errorMsg = err.message || String(err);
            if (err.response) {
              const errData = err.response.data;
              const errStr = typeof errData === 'object' ? JSON.stringify(errData) : String(errData);
              errorMsg = `HTTP ${err.response.status}: ${errStr}`;
            }
            return {
              name: m.name,
              status: "Offline" as const,
              statusCode: err.response?.status || 500,
              latency: `${latency}ms`,
              error: errorMsg
            };
          }
        })
      );

      res.json({ success: true, health: results });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Get saved emails from active DB (filtered by tenant_id and optional source_email)
  app.get("/api/emails", async (req, res) => {
    try {
      const tenantId = req.query.tenant_id 
        ? Number(req.query.tenant_id) 
        : (req.headers['x-tenant-id'] ? Number(req.headers['x-tenant-id']) : undefined);
      const sourceEmail = req.query.source_email ? String(req.query.source_email) : undefined;
      const emails = await dbGetAllEmails(tenantId, sourceEmail);
      res.json({ success: true, emails });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // ==========================================
  // MAIL CONFIGURATIONS API (MULTI-ACCOUNT)
  // ==========================================
  app.get("/api/mail-configs", async (req, res) => {
    try {
      const { dbGetMailConfigs } = await import("./src/services/dbManager");
      const tenantId = req.query.tenant_id ? Number(req.query.tenant_id) : undefined;
      const configs = await dbGetMailConfigs(tenantId);
      res.json({ success: true, configs });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  app.post("/api/mail-configs", async (req, res) => {
    try {
      const { dbSaveMailConfig } = await import("./src/services/dbManager");
      const { tenant_id, email_address, host, port, username, password, is_active } = req.body;
      if (!tenant_id || !email_address || !host || !username) {
        return res.status(400).json({ success: false, message: "tenant_id, email_address, host, dan username wajib diisi" });
      }
      const config = await dbSaveMailConfig({
        tenant_id: Number(tenant_id),
        email_address: String(email_address).trim(),
        host: String(host).trim(),
        port: Number(port) || 995,
        username: String(username).trim(),
        password: String(password || ''),
        is_active: is_active !== false
      });
      res.json({ success: true, config });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  app.put("/api/mail-configs/:id", async (req, res) => {
    try {
      const { dbUpdateMailConfig } = await import("./src/services/dbManager");
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, message: "Invalid mail config ID" });
      }
      await dbUpdateMailConfig(id, req.body);
      res.json({ success: true, message: "Mail config updated successfully" });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  app.delete("/api/mail-configs/:id", async (req, res) => {
    try {
      const { dbDeleteMailConfig } = await import("./src/services/dbManager");
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, message: "Invalid mail config ID" });
      }
      await dbDeleteMailConfig(id);
      res.json({ success: true, message: "Mail config deleted successfully" });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  app.post("/api/mail-configs/test", async (req, res) => {
    try {
      const { Pop3Client } = await import("./src/pop3");
      const { host, port, username, password } = req.body;
      if (!host || !username) {
        return res.status(400).json({ success: false, message: "Host dan Username wajib diisi" });
      }
      const client = new Pop3Client();
      try {
        await client.connect(host, Number(port) || 995);
        await client.sendCommand(`USER ${username}`);
        const authRes = await client.sendCommand(`PASS ${password}`);
        await client.sendCommand(`QUIT`).catch(() => {});
        client.close();
        if (authRes.startsWith("+OK")) {
          return res.json({ success: true, message: `Otentikasi POP3 berhasil ke ${host}:${port} untuk ${username} (+OK)` });
        } else {
          return res.status(400).json({ success: false, message: `POP3 Auth gagal: ${authRes.trim()}` });
        }
      } catch (connErr: any) {
        return res.status(400).json({ success: false, message: `Gagal terhubung ke ${host}:${port} - ${connErr.message || String(connErr)}` });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // ==========================================
  // MULTI-TENANT SAAS & AUTHENTICATION API
  // ==========================================

  // Authentication: Login endpoint
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ success: false, message: "Email dan password wajib diisi" });
      }
      const { dbValidateUserCredentials } = await import("./src/services/dbManager");
      const user = await dbValidateUserCredentials(email, password);
      if (!user) {
        return res.status(401).json({ success: false, message: "Email atau password salah" });
      }
      const { password_hash, ...userNoHash } = user;
      res.json({ success: true, user: userNoHash });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Multi-Tenant: Get all tenants or single tenant
  app.get("/api/tenants", async (req, res) => {
    try {
      const { dbGetTenants, dbGetTenantById } = await import("./src/services/dbManager");
      if (req.query.id) {
        const tenant = await dbGetTenantById(Number(req.query.id));
        return res.json({ success: true, tenant });
      }
      const tenants = await dbGetTenants();
      res.json({ success: true, tenants });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Multi-Tenant: Update or Create Tenant settings (AI Models, Feature Toggles, POP3, WA)
  app.post("/api/tenants", async (req, res) => {
    try {
      const { dbSaveTenant } = await import("./src/services/dbManager");
      const tenant = await dbSaveTenant(req.body);
      res.json({ success: true, tenant });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Multi-Tenant: Delete Tenant
  app.delete("/api/tenants/:id", async (req, res) => {
    try {
      const { dbDeleteTenant } = await import("./src/services/dbManager");
      const success = await dbDeleteTenant(Number(req.params.id));
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Dynamic Filters Master Data Endpoints (Super Admin Only with Multi-Tenant Isolation)
  app.get("/api/dynamic-filters", async (req, res) => {
    try {
      const { dbGetDynamicFilters } = await import("./src/services/dbManager");
      const tenantId = req.query.tenant_id ? Number(req.query.tenant_id) : 1;
      const filters = await dbGetDynamicFilters(tenantId);
      res.json({ success: true, filters });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  app.post("/api/dynamic-filters", async (req, res) => {
    try {
      const { dbSaveDynamicFilter } = await import("./src/services/dbManager");
      const tenantId = req.body.tenant_id ? Number(req.body.tenant_id) : 1;
      await dbSaveDynamicFilter({ ...req.body, tenant_id: tenantId }, tenantId);
      res.json({ success: true, message: "Berhasil menyimpan aturan Dynamic Filter." });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  app.delete("/api/dynamic-filters/:id", async (req, res) => {
    try {
      const { dbDeleteDynamicFilter } = await import("./src/services/dbManager");
      const tenantId = req.query.tenant_id ? Number(req.query.tenant_id) : 1;
      await dbDeleteDynamicFilter(Number(req.params.id), tenantId);
      res.json({ success: true, message: "Aturan Dynamic Filter berhasil dihapus." });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Multi-Tenant: Get Daily Bulk Summaries for Division/Tenant
  app.get("/api/daily-summaries", async (req, res) => {
    try {
      const { dbGetDailySummaries } = await import("./src/services/dbManager");
      const tenantId = req.query.tenant_id ? Number(req.query.tenant_id) : undefined;
      const summaries = await dbGetDailySummaries(tenantId);
      res.json({ success: true, summaries });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Get single Daily Bulk Summary by ID with populated source_emails
  app.get("/api/daily-summaries/:id", async (req, res) => {
    try {
      const { dbGetDailySummaryById } = await import("./src/services/dbManager");
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, message: "Invalid summary ID" });
      }
      const summary = await dbGetDailySummaryById(id);
      if (!summary) {
        return res.status(404).json({ success: false, message: "Summary not found" });
      }
      res.json({ success: true, summary });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Trigger WA Blast for specific Daily Bulk Summary
  app.post("/api/daily-summaries/:id/wa-blast", async (req, res) => {
    try {
      const { dbGetDailySummaryById, dbUpdateDailySummaryWaStatus } = await import("./src/services/dbManager");
      const id = Number(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, message: "Invalid summary ID" });
      }
      const summary = await dbGetDailySummaryById(id);
      if (!summary) {
        return res.status(404).json({ success: false, message: "Summary not found" });
      }

      await dbUpdateDailySummaryWaStatus(id, true);
      res.json({ success: true, message: `Berhasil mengirim Blast WA Rangkuman Harian #${id} ke nomor WhatsApp divisi!` });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Multi-Tenant: Trigger Daily Bulk Summary manually
  const handleBulkSummaryTrigger = async (req: any, res: any) => {
    try {
      const { performBulkSummaryForTenants } = await import("./src/cron");
      const { dbGetDailySummaries } = await import("./src/services/dbManager");
      const tenantId = req.body?.tenant_id ? Number(req.body.tenant_id) : undefined;
      const createdSummaries = await performBulkSummaryForTenants(tenantId);
      
      const latestSummaries = await dbGetDailySummaries(tenantId);
      const summaryData = (createdSummaries && createdSummaries.length > 0)
        ? createdSummaries[0]
        : (latestSummaries && latestSummaries.length > 0 ? latestSummaries[0] : null);

            res.json({
        success: true,
        message: tenantId ? `Bulk summary generated for Tenant ID ${tenantId}.` : "Bulk summaries generated successfully for all enabled divisions.",
        data: summaryData ? {
          ...summaryData,
          summary_text: summaryData.content_text,
          generated_at: summaryData.created_at,
          referenced_emails: summaryData.source_emails
        } : null,
        summaries: latestSummaries
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  };

  const handleSingleBulkSummaryGenerate = async (req: any, res: any) => {
    try {
      const { generateDailySummary } = await import("./src/services/aiProcessingService");
      const { getDbService, dbGetDailySummaries } = await import("./src/services/dbManager");
      
      const tenant_id = req.user?.tenantId || req.user?.tenant_id || req.body?.tenant_id;
      const raw_target_date = req.body?.target_date || req.query?.target_date || req.body?.date || req.query?.date;
      const is_merge = Boolean(req.body?.is_merge);
      const force_refresh = Boolean(req.body?.force_refresh);

      if (!tenant_id) {
        return res.status(400).json({ success: false, message: "tenant_id wajib disertakan.", data: null });
      }

      const tenantIdNum = Number(tenant_id);

      // INSTRUKSI 1: VALIDASI TANGGAL (MAX 2 HARI BACKDATE & TIDAK BOLEH MASA DEPAN)
      const now = new Date();
      const getYYYYMMDD = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      const todayStr = getYYYYMMDD(now);
      const h2Date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2);
      const h2Str = getYYYYMMDD(h2Date);

      const target_date = (raw_target_date && typeof raw_target_date === 'string' && raw_target_date.trim())
        ? raw_target_date.trim().split('T')[0]
        : todayStr;

      if (target_date > todayStr) {
        return res.status(400).json({
          success: false,
          message: "Tidak dapat merangkum tanggal di masa depan.",
          data: null
        });
      }

      if (target_date < h2Str) {
        return res.status(400).json({
          success: false,
          message: `Peringatan: Rentang tanggal melebihi batas maksimal 2 hari ke belakang. Silakan pilih tanggal antara ${h2Str} sampai ${todayStr}.`,
          data: null
        });
      }

      // Check cache in database first using explicit string query or dbGetDailySummaryByDate ($2::date)
      const { dbGetDailySummaryByDate } = await import("./src/services/dbManager");
      const cachedSummary = await dbGetDailySummaryByDate(tenantIdNum, target_date);

      // INSTRUKSI 2: LOGIKA BACKEND CACHE & INCREMENTAL DETECTION
      const dbService = await getDbService();
      let emailCountNow = 0;
      if (dbService.type === 'postgres' && dbService.pgPool) {
        const cntRes = await dbService.pgPool.query(
          `SELECT COUNT(*)::int as cnt FROM public.emails WHERE tenant_id = $1 AND DATE("date") = $2::date`,
          [tenantIdNum, target_date]
        );
        emailCountNow = Number(cntRes.rows[0]?.cnt || 0);
      } else if (dbService.type === 'mongodb' && dbService.mongoDb) {
        const startOfDay = new Date(target_date);
        startOfDay.setHours(0,0,0,0);
        const endOfDay = new Date(target_date);
        endOfDay.setHours(23,59,59,999);
        emailCountNow = await dbService.mongoDb.collection('emails').countDocuments({
          tenant_id: tenantIdNum,
          $or: [{ received_at: { $gte: startOfDay, $lte: endOfDay } }, { date: { $gte: startOfDay, $lte: endOfDay } }]
        });
      }

      const isPastDate = target_date < todayStr;

      // Kondisi A: Tanggal Masa Lalu -> Return Cache tanpa AI
      if (isPastDate && cachedSummary && !force_refresh) {
        return res.json({
          success: true,
          cached: true,
          has_new_emails: false,
          new_emails_count: 0,
          message: `Rangkuman tanggal ${target_date} dimuat dari cache database.`,
          data: {
             ...cachedSummary,
             summary_text: cachedSummary.content_text,
             generated_at: cachedSummary.created_at,
             referenced_emails: cachedSummary.source_emails
          }
        });
      }

      // Kondisi B: Hari Ini / Incremental Check
      if (!isPastDate && cachedSummary && !force_refresh && !is_merge) {
        const processedCount = Number((cachedSummary as any).total_emails_processed || (cachedSummary.source_email_ids ? cachedSummary.source_email_ids.length : 0));
        const newEmailsCount = Math.max(0, emailCountNow - processedCount);

        if (newEmailsCount > 0) {
          return res.json({
            success: true,
            cached: true,
            has_new_emails: true,
            new_emails_count: newEmailsCount,
            total_emails_now: emailCountNow,
            total_emails_processed: processedCount,
            message: `Terdeteksi ${newEmailsCount} email baru sejak rangkuman terakhir. Klik 'Merge New Emails' untuk memperbarui.`,
            data: {
               ...cachedSummary,
               summary_text: cachedSummary.content_text,
               generated_at: cachedSummary.created_at,
               referenced_emails: cachedSummary.source_emails
            }
          });
        } else {
          return res.json({
            success: true,
            cached: true,
            has_new_emails: false,
            new_emails_count: 0,
            message: "Rangkuman harian sudah paling baru (cached).",
            data: {
               ...cachedSummary,
               summary_text: cachedSummary.content_text,
               generated_at: cachedSummary.created_at,
               referenced_emails: cachedSummary.source_emails
            }
          });
        }
      }

      // Otherwise, generate/merge with Core AI
      const estimated_seconds = Math.max(4, Math.ceil((emailCountNow || 5) * 0.4));
      
      try {
        const summary = await generateDailySummary(tenantIdNum, target_date);
        return res.json({
          success: true,
          cached: false,
          has_new_emails: false,
          new_emails_count: 0,
          estimated_seconds,
          message: is_merge 
            ? `Berhasil menggabungkan ${emailCountNow} email ke dalam Executive Summary.`
            : `Summary berhasil digenerate untuk tanggal ${target_date}.`,
          data: {
             ...summary,
             summary_text: summary.content_text,
             generated_at: summary.created_at,
             referenced_emails: summary.source_emails
          }
        });
      } catch (err: any) {
        if (err.message && err.message.includes('Tidak ada email masuk')) {
           return res.json({
             success: false,
             message: err.message,
             data: null
           });
        }
        throw err;
      }
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err), data: null });
    }
  };

  app.post("/api/daily-summaries/trigger", handleBulkSummaryTrigger);
  app.post("/api/bulk-summary/generate", handleSingleBulkSummaryGenerate);


  app.post("/api/emails/update-status", async (req, res) => {
    try {
      const { message_id, processed_tickets, target_tickets, order_status } = req.body;
      if (!message_id) return res.status(400).json({ success: false, message: 'message_id required' });
      
      const { getDbService } = await import("./src/services/dbManager");
      const dbService = await getDbService();

      if (dbService.type === 'postgres' && dbService.pgPool) {
        await dbService.pgPool.query(
          "UPDATE public.emails SET processed_tickets = $1, target_tickets = $2, order_status = $3 WHERE message_id = $4 OR id::text = $4",
          [processed_tickets, target_tickets, order_status, message_id]
        );
      } else if (dbService.type === 'mongodb' && dbService.mongoDb) {
        await dbService.mongoDb.collection('emails').updateOne(
          { $or: [{ message_id }, { _id: message_id }] },
          { $set: { processed_tickets, target_tickets, order_status } }
        );
      }
      
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Get pending orders
  app.get("/api/emails/pending-orders", async (req, res) => {
    try {
      const { getDbService } = await import("./src/services/dbManager");
      const dbService = await getDbService();
      const tenant_id = req.user?.tenantId || req.user?.tenant_id || req.query?.tenant_id;
      const tenantId = tenant_id ? Number(tenant_id) : undefined;
      
      let emails = [];
      if (dbService.type === 'postgres' && dbService.pgPool) {
        let q = "SELECT * FROM public.emails WHERE (order_status = 'NEW' OR order_status = 'PARTIAL' OR is_cit_order = true) AND (order_status != 'COMPLETED' OR order_status IS NULL)";
        let params = [];
        if (tenantId) {
          q += " AND tenant_id = $1";
          params.push(tenantId);
        }
        q += " ORDER BY date DESC NULLS LAST LIMIT 50";
        const resDb = await dbService.pgPool.query(q, params);
        emails = resDb.rows;
      } else if (dbService.type === 'mongodb' && dbService.mongoDb) {
        const query: any = { 
          $or: [
            { order_status: 'NEW' },
            { order_status: 'PARTIAL' },
            { is_cit_order: true }
          ],
          order_status: { $ne: 'COMPLETED' }
        };
        if (tenantId) query.tenant_id = tenantId;
        emails = await dbService.mongoDb.collection('emails').find(query).sort({ received_at: -1, date: -1 }).limit(50).toArray();
      }
      
      res.json({ success: true, emails });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get("/api/bulk-summary/today", async (req, res) => {
    try {
      const { dbGetDailySummaries, dbGetDailySummaryByDate, getDbService } = await import("./src/services/dbManager");
      const tenant_id = req.user?.tenantId || req.user?.tenant_id || req.query?.tenant_id;
      const target_date = req.query?.target_date || req.query?.date;
      const tenantId = tenant_id ? Number(tenant_id) : undefined;
      
      const now = new Date();
      const getYYYYMMDD = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      const todayStr = getYYYYMMDD(now);
      const targetDateStr = typeof target_date === 'string' && target_date ? target_date.trim().split('T')[0] : todayStr;

      let matchedSummary = tenantId ? await dbGetDailySummaryByDate(tenantId, targetDateStr) : null;
      const latestSummaries = await dbGetDailySummaries(tenantId);
      if (!matchedSummary) {
        matchedSummary = latestSummaries.find((s: any) => {
          const sDate = String(s.summary_date || '').trim().split('T')[0];
          return sDate === targetDateStr;
        }) || (target_date ? null : latestSummaries[0]);
      }

      let has_new_emails = false;
      let new_emails_count = 0;
      let emailCountNow = 0;

      if (matchedSummary && tenantId && targetDateStr === todayStr) {
        const dbService = await getDbService();
        if (dbService.type === 'postgres' && dbService.pgPool) {
          const cntRes = await dbService.pgPool.query(
            `SELECT COUNT(*)::int as cnt FROM public.emails WHERE tenant_id = $1 AND DATE("date") = $2::date`,
            [tenantId, targetDateStr]
          );
          emailCountNow = Number(cntRes.rows[0]?.cnt || 0);
        } else if (dbService.type === 'mongodb' && dbService.mongoDb) {
          const startOfDay = new Date(targetDateStr);
          startOfDay.setHours(0,0,0,0);
          const endOfDay = new Date(targetDateStr);
          endOfDay.setHours(23,59,59,999);
          emailCountNow = await dbService.mongoDb.collection('emails').countDocuments({
            tenant_id: tenantId,
            $or: [{ received_at: { $gte: startOfDay, $lte: endOfDay } }, { date: { $gte: startOfDay, $lte: endOfDay } }]
          });
        }
        const processedCount = Number((matchedSummary as any).total_emails_processed || (matchedSummary.source_email_ids ? matchedSummary.source_email_ids.length : 0));
        new_emails_count = Math.max(0, emailCountNow - processedCount);
        has_new_emails = new_emails_count > 0;
      }

      res.json({
        success: true,
        cached: !!matchedSummary,
        has_new_emails,
        new_emails_count,
        total_emails_now: emailCountNow,
        data: matchedSummary ? {
          ...matchedSummary,
          summary_text: matchedSummary.content_text,
          generated_at: matchedSummary.created_at,
          referenced_emails: matchedSummary.source_emails
        } : null,
        summaries: latestSummaries
      });
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

  // ==========================================
  // SUPER ADMIN REDIS & BULLMQ MONITORING API
  // ==========================================
  app.get("/api/admin/queue-status", async (req, res) => {
    try {
      const { emailQueue } = await import("./src/config/queue");
      
      let counts = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
      let completedJobs: any[] = [];
      let failedJobs: any[] = [];

      try {
        const rawCounts = await emailQueue.getJobCounts();
        counts = {
          waiting: rawCounts.waiting || 0,
          active: rawCounts.active || 0,
          completed: rawCounts.completed || 0,
          failed: rawCounts.failed || 0,
          delayed: rawCounts.delayed || 0,
        };
      } catch (e: any) {
        console.warn("[Queue API Warning] Could not fetch job counts:", e.message);
      }

      try {
        const rawCompleted = await emailQueue.getCompleted(0, 50);
        completedJobs = rawCompleted.map(job => ({
          id: job.id,
          name: job.name,
          data: job.data || {},
          timestamp: job.timestamp,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          durationMs: (job.finishedOn && job.processedOn) ? (job.finishedOn - job.processedOn) : null,
          returnvalue: job.returnvalue
        }));
      } catch (e: any) {
        console.warn("[Queue API Warning] Could not fetch completed jobs:", e.message);
      }

      try {
        const rawFailed = await emailQueue.getFailed(0, 50);
        failedJobs = rawFailed.map(job => ({
          id: job.id,
          name: job.name,
          data: job.data || {},
          timestamp: job.timestamp,
          failedReason: job.failedReason || 'Unknown LLM Exception',
          stacktrace: job.stacktrace || [],
          attemptsMade: job.attemptsMade
        }));
      } catch (e: any) {
        console.warn("[Queue API Warning] Could not fetch failed jobs:", e.message);
      }

      res.json({
        success: true,
        counts,
        completedJobs,
        failedJobs
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  app.post("/api/admin/queue-retry/:jobId", async (req, res) => {
    try {
      const { jobId } = req.params;
      const { emailQueue } = await import("./src/config/queue");
      
      let retried = false;
      try {
        const job = await emailQueue.getJob(jobId);
        if (job) {
          await job.retry();
          retried = true;
        }
      } catch (e) {
        console.warn(`[Queue API Warning] Standard job.retry() failed for ${jobId}, re-adding to queue...`);
      }

      if (!retried) {
        const emailId = req.body?.email_id || jobId;
        const tenantId = req.body?.tenant_id || 1;
        await emailQueue.add('process-email', { email_id: emailId, tenant_id: tenantId }, { attempts: 3 });
      }

      res.json({ success: true, message: `Job ${jobId} dipancing ulang ke antrean AI.` });
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

  // POST Trigger Bulk AI Process / Extract
  const handleBulkExtract = async (req: any, res: any) => {
    try {
      const { emailQueue, aiQueue } = await import("./src/config/queue");
      const activeQueue = aiQueue || emailQueue;
      const { dbGetPendingEmails } = await import("./src/services/dbManager");
      const { dbGetAllPendingEmails } = await import("./src/database-service");

      const userTenantId = req.user?.tenantId || req.user?.tenant_id || req.body?.tenant_id || req.query?.tenant_id;
      const tenantId = userTenantId ? Number(userTenantId) : undefined;

      // INSTRUKSI 1: Ambil SELURUH data email pending dari database
      let pendingEmails: any[] = [];
      try {
        pendingEmails = await dbGetPendingEmails(tenantId);
      } catch (err) {
        console.warn("[Bulk Extract] dbGetPendingEmails error, falling back to dbGetAllPendingEmails:", err);
      }

      if (!pendingEmails || pendingEmails.length === 0) {
        const allPending = await dbGetAllPendingEmails();
        pendingEmails = tenantId 
          ? allPending.filter((e: any) => !e.tenant_id || Number(e.tenant_id) === tenantId)
          : allPending;
      }

      if (!pendingEmails || pendingEmails.length === 0) {
        return res.status(200).json({
          success: true,
          message: "Tidak ada email pending untuk diproses.",
          queued_count: 0
        });
      }

      // INSTRUKSI 2: Push ke Redis Queue (Full Payload & Fire and Forget)
      let queuedCount = 0;
      for (const email of pendingEmails) {
        const messageId = String(email.message_id || email.id || '').trim();
        if (!messageId) continue;

        await activeQueue.add('process-email', {
          message_id: messageId,
          tenant_id: email.tenant_id ? Number(email.tenant_id) : (tenantId || 1),
          subject: email.subject || '',
          body: email.body || email.body_text || email.html_body || '', // WAJIB ADA
          sender: email.sender || email.sender_email || '',
          received_at: email.received_at || email.date || new Date().toISOString()
        }, {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000
          }
        });
        queuedCount++;
      }

      console.log(`[Bulk Extract] Successfully enqueued ${queuedCount} emails to Redis queue.`);

      // INSTRUKSI 3: Kembalikan respons cepat ke UI
      return res.status(200).json({
        success: true,
        message: `${queuedCount} email berhasil dimasukkan ke antrean AI untuk diproses secara massal.`,
        queued_count: queuedCount
      });
    } catch (err: any) {
      console.error("[Bulk Extraction API Error]:", err);
      return res.status(500).json({
        success: false,
        message: err.message || String(err),
        queued_count: 0
      });
    }
  };

  app.post("/api/ai/bulk-extract", handleBulkExtract);
  app.post("/api/ai/bulk-process", handleBulkExtract);
  app.post("/api/emails/bulk-extract", handleBulkExtract);
  app.post("/api/emails/bulk-process", handleBulkExtract);

  // INSTRUKSI 2: BACKEND ENDPOINT & QUERY SQL RESET (POST /api/ai/resummary-tenant)
  app.post("/api/ai/resummary-tenant", async (req, res) => {
    try {
      const { tenant_id, account_email } = req.body || {};
      const userTenantId = req.user?.tenantId || req.user?.tenant_id || tenant_id;
      const tenantId = userTenantId ? Number(userTenantId) : 1;
      const accountEmail = account_email ? String(account_email).trim() : '';

      const { getDbService } = await import("./src/services/dbManager");
      const { aiQueue } = await import("./src/config/queue");
      const dbService = await getDbService();

      if (dbService.type === 'postgres' && dbService.pgPool) {
        // Tahap A: SQL Reset Data AI
        let resetQuery = `
          UPDATE emails 
          SET 
              summary = NULL, 
              action_required = NULL, 
              tag_type = NULL,
              suggested_tag = NULL, 
              is_important = NULL, 
              urgency_level = NULL,
              denomination_breakdown = '{}'::jsonb
          WHERE tenant_id = $1
        `;
        const resetParams: any[] = [tenantId];
        if (accountEmail && accountEmail !== 'all') {
          resetQuery += ` AND (receiver = $2 OR sender = $2 OR source_email = $2)`;
          resetParams.push(accountEmail);
        }

        await dbService.pgPool.query(resetQuery, resetParams);
        console.log(`[Re-Summary Tenant] Tahap A Selesai: Reset summary data AI di PostgreSQL untuk Tenant ID ${tenantId} (Account: ${accountEmail || 'All'})`);

        // Tahap B: Ambil Data & Push ke Redis
        let selectQuery = `
          SELECT * FROM emails 
          WHERE tenant_id = $1 AND summary IS NULL
        `;
        const selectParams: any[] = [tenantId];
        if (accountEmail && accountEmail !== 'all') {
          selectQuery += ` AND (receiver = $2 OR sender = $2 OR source_email = $2)`;
          selectParams.push(accountEmail);
        }

        const resDb = await dbService.pgPool.query(selectQuery, selectParams);
        const resetEmails = resDb.rows;

        let enqueuedCount = 0;
        for (const email of resetEmails) {
          const messageId = String(email.message_id || email.id || '').trim();
          if (!messageId) continue;

          await aiQueue.add('process-email', {
            message_id: messageId,
            tenant_id: email.tenant_id ? Number(email.tenant_id) : tenantId,
            subject: email.subject || '',
            body: email.body_text || email.body || email.html_body || '',
            body_text: email.body_text || email.body || '',
            sender: email.sender || '',
            receiver: email.receiver || '',
            date: email.date || new Date().toISOString()
          }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 }
          });
          enqueuedCount++;
        }

        console.log(`[Re-Summary Tenant] Tahap B Selesai: ${enqueuedCount} email dimasukkan ke aiQueue Redis.`);

        return res.status(200).json({
          success: true,
          message: `Berhasil me-reset data AI dan mendaftarkan ${enqueuedCount} email ke antrean Redis Queue.`,
          enqueued_count: enqueuedCount
        });
      } else {
        // Fallback engine (MongoDB / Local)
        const { dbGetAllEmails, dbUpdateEmailFields } = await import("./src/database-service");
        const allEmails = await dbGetAllEmails();
        const filtered = allEmails.filter(e => Number(e.tenant_id) === tenantId);

        let enqueuedCount = 0;
        for (const email of filtered) {
          await dbUpdateEmailFields(email.message_id, {
            summary: null,
            action_required: null,
            tag_type: null,
            suggested_tag: null,
            is_important: null,
            urgency_level: null,
            denomination_breakdown: {}
          });

          await aiQueue.add('process-email', {
            message_id: email.message_id,
            tenant_id: tenantId,
            subject: email.subject || '',
            body: email.body_text || email.body || '',
            sender: email.sender || '',
            date: email.date || new Date().toISOString()
          });
          enqueuedCount++;
        }

        return res.status(200).json({
          success: true,
          message: `Berhasil me-reset data AI dan mendaftarkan ${enqueuedCount} email ke antrean Redis Queue.`,
          enqueued_count: enqueuedCount
        });
      }
    } catch (err: any) {
      console.error("[Re-Summary Tenant API Error]:", err);
      return res.status(500).json({
        success: false,
        message: err.message || String(err),
        enqueued_count: 0
      });
    }
  });

  /**
   * FLOW: Retroactive Folder Tagging / Custom Filter Sweeping Endpoint
   * 1. Menerima request POST /api/admin/backfill-folders.
   * 2. Menjalankan dbBackfillFolders() untuk menyapu dan mencocokkan email lama dengan custom_filters.
   * 3. Mengembalikan response JSON { success: true, totalProcessed, totalMatched, message }.
   */
  const handleBackfillFolders = async (req: express.Request, res: express.Response) => {
    try {
      console.log("[API Admin] Starting retroactive folder tagging / backfill...");
      const result = await dbBackfillFolders();
      res.json(result);
    } catch (err: any) {
      console.error("[API Admin] Backfill folders failed:", err);
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  };

  app.post("/api/admin/backfill-folders", handleBackfillFolders);
  app.post("/api/emails/backfill-folders", handleBackfillFolders);

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

  // AI Processing Progress Status Endpoint
  app.get("/api/emails/ai-progress", async (req, res) => {
    try {
      const { getDatabaseConfig } = await import("./src/utils/configManager.js");
      const { getPostgresPool } = await import("./src/lib/postgres.js");
      const config = await getDatabaseConfig();
      const pgConnString = config.connections?.postgres || process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/email_ticketing";
      const pool = await getPostgresPool(pgConnString);

      const totalRes = await pool.query("SELECT COUNT(*) as total FROM public.emails;");
      const total = parseInt(totalRes.rows[0]?.total || "0", 10);

      const unanalyzedRes = await pool.query(`
        SELECT COUNT(*) as unanalyzed FROM public.emails 
        WHERE ai_status = 'PENDING' 
           OR ai_status IS NULL 
           OR summary IS NULL 
           OR TRIM(summary) = '';
      `);
      const unanalyzed = parseInt(unanalyzedRes.rows[0]?.unanalyzed || "0", 10);

      const completed = Math.max(0, total - unanalyzed);
      const percentage = total > 0 ? Math.round((completed / total) * 100) : 100;

      res.json({
        success: true,
        total,
        unanalyzed,
        completed,
        percentage,
        is_analyzing: unanalyzed > 0
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Single AI Model Tester Endpoint for Superadmin
  app.post("/api/admin/ai/test-model", async (req, res) => {
    try {
      const { modelName, modelKey } = req.body || {};
      const targetModel = modelKey || modelName;
      if (!targetModel) {
        return res.status(400).json({ success: false, message: "Parameter modelKey / modelName wajib diisi." });
      }

      const { testSingleAiModel } = await import("./src/services/aiProcessingService.js");
      const result = await testSingleAiModel(targetModel);

      if (result.success) {
        res.json({
          success: true,
          model: targetModel,
          modelName: result.modelName || targetModel,
          latency: result.latency,
          responseText: result.responseText,
          output: result.output,
          message: `Model ${result.modelName || targetModel} berhasil diuji (${result.latency} ms)`
        });
      } else {
        res.status(500).json({
          success: false,
          model: targetModel,
          modelName: result.modelName || targetModel,
          latency: result.latency,
          error: result.error,
          message: `Gagal menguji model ${targetModel}: ${result.error}`
        });
      }
    } catch (err: any) {
      console.error("[API Test AI Model Error]:", err);
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // AI System Health Monitor Endpoint
  app.get("/api/system/ai-health", async (req, res) => {
    try {
      const { testSingleAiModel } = await import("./src/services/aiProcessingService.js");
      const modelsToTest = [
        "Gemini Flash Latest",
        "Custom AI Core",
        "Custom AI Vision",
        "Nemotron 3 Nano Omni 30B",
        "Nemotron 3 Super 120B",
        "Qwen3 Next 80B",
        "StepFun AI Step 3.7 Flash"
      ];

      const healthList = await Promise.all(
        modelsToTest.map(async (name) => {
          const result = await testSingleAiModel(name);
          return {
            name,
            status: result.success ? "Online" : "Offline",
            statusCode: result.success ? 200 : 500,
            latency: `${result.latency} ms`,
            error: result.error
          };
        })
      );

      res.json({ success: true, health: healthList });
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

  // GET Email Detail by ID or message_id with mapped property names
  app.get("/api/emails/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const reserved = ['grouped', 'mark-read', 'analyze', 'pending-summary', 'pending-intelligence', 'bulk-summary', 'bulk-intelligence', 'update-fields', 'smart-apply', 'backfill', 'backfill-and-resummarize'];
      if (reserved.includes(id)) {
        return res.status(400).json({ success: false, message: "Invalid endpoint parameter" });
      }

      let email = await dbGetEmailByMessageId(id);

      // Direct PostgreSQL query check if not found by primary helper
      if (!email) {
        try {
          const { getDatabaseConfig } = await import("./src/utils/configManager");
          const { getPostgresPool } = await import("./src/lib/postgres");
          const config = await getDatabaseConfig();
          const pgConnString = config.connections?.postgres || process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/email_ticketing";
          const pool = await getPostgresPool(pgConnString);

          const isNumeric = /^\d+$/.test(id);
          let dbRes;
          if (isNumeric) {
            dbRes = await pool.query("SELECT * FROM public.emails WHERE id = $1 LIMIT 1", [parseInt(id, 10)]);
            if (dbRes.rows.length === 0) {
              dbRes = await pool.query("SELECT * FROM public.emails WHERE message_id = $1 LIMIT 1", [id]);
            }
          } else {
            // String hash message_id query
            dbRes = await pool.query("SELECT * FROM public.emails WHERE message_id = $1 LIMIT 1", [id]);
          }

          if (dbRes.rows.length > 0) {
            const row = dbRes.rows[0];
            email = {
              id: row.id,
              message_id: row.message_id,
              subject: row.subject || '',
              sender: row.sender || row.sender_email || '',
              receiver: row.receiver || '',
              date: row.date || '',
              body_text: row.body_text || row.body || '',
              html_body: row.html_body || row.body_html || '',
              tags: typeof row.tags === 'string' ? JSON.parse(row.tags || '[]') : (row.tags || []),
              category: row.category || '',
              sub_category: row.sub_category || '',
              folder_parent: row.folder_parent || '',
              folder_child: row.folder_child || '',
              api_workflow_status: row.api_workflow_status || 'none',
              api_workflow_log: row.api_workflow_log || '',
              attachments: typeof row.attachments === 'string' ? JSON.parse(row.attachments || '[]') : (row.attachments || []),
              is_read: row.is_read === true || row.is_read === 1,
              tag_type: row.tag_type || '',
              summary: row.summary || '',
              action_required: row.action_required === true || row.action_required === 1,
              suggested_tag: row.suggested_tag || '',
              is_important: row.is_important === true || row.is_important === 1,
              urgency_level: row.urgency_level || 'Routine',
              suggested_folder_parent: row.suggested_folder_parent || '',
              suggested_folder_child: row.suggested_folder_child || '',
              is_cit_order: row.is_cit_order === true || row.is_cit_order === 1,
              cit_type: row.cit_type || 'None',
              suggested_bank: row.suggested_bank || '',
              extracted_notes: row.extracted_notes || '',
              currency: row.currency || 'IDR',
              denomination_suggestion: row.denomination_suggestion !== undefined && row.denomination_suggestion !== null ? Number(row.denomination_suggestion) : undefined,
              total_amount: row.total_amount !== undefined && row.total_amount !== null ? Number(row.total_amount) : undefined,
              ai_status: row.ai_status || 'PENDING',
              is_summarized: row.is_summarized === 1 || row.is_summarized === true || row.ai_status === 'COMPLETED' || (!!row.summary && row.summary.trim().length > 0)
            } as any;
          }
        } catch (dbErr) {
          console.warn("[GET /api/emails/:id Direct PostgreSQL Query Error]:", dbErr);
        }
      }

      if (!email) {
        return res.status(404).json({ success: false, message: "Email not found" });
      }

      const mappedEmail = {
        ...email,
        sender_email: email.sender || (email as any).sender_email || '',
        from: email.sender || (email as any).sender_email || '',
        subject: email.subject || '',
        received_at: email.date || (email as any).received_at || '',
        date: email.date || (email as any).received_at || '',
        body_html: email.html_body || (email as any).body_html || '',
        body_text: email.body_text || (email as any).body || ''
      };

      res.json({
        success: true,
        email: mappedEmail,
        raw_email_data: mappedEmail
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // Combo Backfill Folder Tagging & Re-summarize (Pure PostgreSQL)
  app.post("/api/emails/backfill-and-resummarize", async (req, res) => {
    try {
      const { getDatabaseConfig } = await import("./src/utils/configManager");
      const { getPostgresPool } = await import("./src/lib/postgres");
      const { analyzeEmailContent } = await import("./src/services/aiProcessingService");

      const config = await getDatabaseConfig();
      const pgConnString = config.connections?.postgres || "postgresql://postgres:postgres@localhost:5432/email_ticketing";

      const pool = await getPostgresPool(pgConnString);
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // 1. Target Query
        const targetQuery = `
          SELECT * FROM public.emails 
          WHERE folder_parent IS NULL 
             OR folder_child IS NULL 
             OR folder_parent = 'Lainnya' 
             OR summary IS NULL 
             OR TRIM(summary) = '' 
             OR summary LIKE 'Ringkasan email dari pengirim%' 
             OR summary LIKE 'Email dari pengirim mengenai%' 
             OR summary LIKE 'Data historis tidak terbaca jelas%'
          ORDER BY id ASC;
        `;
        const targetRes = await client.query(targetQuery);
        const emailsToProcess = targetRes.rows;

        // 2. Custom Filters Query
        const filtersRes = await client.query("SELECT * FROM public.custom_filters ORDER BY id ASC;");
        const filters = filtersRes.rows;

        let totalProcessed = 0;

        for (const email of emailsToProcess) {
          let folderParent = email.folder_parent || 'Operation';
          let folderChild = email.folder_child || 'General';

          // Match custom_filters
          const emailSender = (email.sender || email.sender_email || '').toLowerCase();
          const emailSubject = (email.subject || '').toLowerCase();
          const emailBody = (email.body_text || email.body || '').toLowerCase();

          for (const f of filters) {
            const matchFrom = f.match_from ? emailSender.includes(f.match_from.toLowerCase()) : true;
            const matchSubj = f.match_subject ? emailSubject.includes(f.match_subject.toLowerCase()) : true;
            const matchBody = f.match_body ? emailBody.includes(f.match_body.toLowerCase()) : true;

            if (f.match_from || f.match_subject || f.match_body) {
              if (matchFrom && matchSubj && matchBody) {
                if (f.action_parent) folderParent = f.action_parent;
                if (f.action_child) folderChild = f.action_child;
                break;
              }
            }
          }

          // Re-summarize via AI Service
          let summary = 'Email mengenai penanganan operasional.';
          let actionRequired = false;
          let suggestedTag = 'Informasi';
          let isImportant = false;
          let urgencyLevel = 'Routine';

          try {
            const aiRes = await analyzeEmailContent({
              message_id: email.message_id,
              subject: email.subject,
              sender: email.sender,
              body_text: email.body_text,
              action_parent: folderParent,
              action_child: folderChild
            });

            if (aiRes) {
              if (aiRes.summary && aiRes.summary.trim().length > 0) {
                summary = aiRes.summary.trim();
              }
              actionRequired = !!aiRes.action_required;
              suggestedTag = aiRes.suggested_tag || aiRes.tag_type || 'Informasi';
              isImportant = !!aiRes.is_important || aiRes.urgency_level === 'High' || actionRequired;
              urgencyLevel = aiRes.urgency_level || (isImportant ? 'High' : 'Routine');
              if (aiRes.suggested_folder_parent) folderParent = aiRes.suggested_folder_parent;
              if (aiRes.suggested_folder_child) folderChild = aiRes.suggested_folder_child;
            }
          } catch (aiErr) {
            console.warn(`[Backfill & Re-summarize AI Warning for email ${email.id}]:`, aiErr);
          }

          // Update record in PostgreSQL
          await client.query(`
            UPDATE public.emails 
            SET folder_parent = $1,
                folder_child = $2,
                summary = $3,
                tag_type = $4,
                action_required = $5,
                is_important = $6,
                urgency_level = $7,
                ai_status = 'COMPLETED',
                is_summarized = TRUE,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $8;
          `, [folderParent, folderChild, summary, suggestedTag, actionRequired, isImportant, urgencyLevel, email.id]);

          totalProcessed++;
        }

        await client.query('COMMIT');

        res.json({
          success: true,
          totalProcessed,
          message: `Berhasil melakukan backfill folder dan re-summarize pada ${totalProcessed} email.`
        });
      } catch (err: any) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error("[POST /api/emails/backfill-and-resummarize Error]:", err);
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // GET Auto-Fill Form Order CIT Data by message_id or id
  app.get(["/api/emails/:message_id/order-cit-data", "/api/emails/order-cit-data/:message_id"], async (req, res) => {
    try {
      const { message_id } = req.params;
      let emailRecord = await dbGetEmailByMessageId(message_id);

      if (!emailRecord) {
        const allEmails = await dbGetAllEmails();
        emailRecord = allEmails.find(e => String(e.message_id) === String(message_id) || String(e.id) === String(message_id));
      }

      if (!emailRecord) {
        return res.status(404).json({ success: false, message: "Email record not found" });
      }

      let parsedBreakdown: any = emailRecord.denomination_breakdown || {};
      if (typeof parsedBreakdown === 'string') {
        try {
          parsedBreakdown = JSON.parse(parsedBreakdown);
        } catch {
          parsedBreakdown = {};
        }
      }

      res.json({
        success: true,
        data: {
          message_id: emailRecord.message_id,
          subject: emailRecord.subject,
          sender: emailRecord.sender,
          summary: emailRecord.summary || '',
          total_amount: emailRecord.total_amount || 0,
          denomination_breakdown: parsedBreakdown,
          denomination_suggestion: emailRecord.denomination_suggestion || 0,
          suggested_bank: emailRecord.suggested_bank || emailRecord.folder_parent || '',
          cit_type: emailRecord.cit_type || 'CIT',
          extracted_notes: emailRecord.extracted_notes || '',
          currency: emailRecord.currency || 'IDR',
          folder_child: emailRecord.folder_child || ''
        }
      });
    } catch (err: any) {
      console.error("[GET /api/emails/:message_id/order-cit-data Error]:", err);
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // GET Email Detail (Returns raw_email_data & ai_extracted_json for Full Page Split View)
  app.get("/api/emails/detail/:message_id", async (req, res) => {
    try {
      const { message_id } = req.params;
      const email = await dbGetEmailByMessageId(message_id);
      if (!email) {
        return res.status(404).json({ success: false, message: "Email not found" });
      }

      // Extract branch and amount heuristics if not present
      let extractedBranch = email.suggested_folder_child || 'MEDAN';
      const branchMatch = (email.body_text || '').match(/(?:Branch|Cabang|Bank\s+Branch\s+Name|Branch\s+Name)\s*[:=]\s*([a-zA-Z0-9\s\-]+)/i);
      if (branchMatch) extractedBranch = branchMatch[1].trim();

      let extractedAmount = email.total_amount || 100000000;
      const amountMatch = (email.body_text || '').match(/(?:Amount|Nilai|Total)\s*[:=]\s*([\d,.]+)/i);
      if (amountMatch) {
        const parsed = parseFloat(amountMatch[1].replace(/,/g, ''));
        if (!isNaN(parsed) && parsed > 0) extractedAmount = parsed;
      }

      const { detectClientFromEmail } = await import("./src/services/clientDetector");
      const detectedClient = detectClientFromEmail(email.sender || '', email.subject || '', email.body_text || '');
      const clientName = detectedClient || email.suggested_bank || (email.folder_child || 'MAYBANK').toUpperCase();

      // Check for multi-orders mentioned in text
      let targetTickets = email.target_tickets || 1;
      const multiMatch = (email.body_text || '').match(/(?:(\d+)\s*(?:order|tiket|lokasi|atm|cabang))/i);
      if (multiMatch && Number(multiMatch[1]) > 1) {
        targetTickets = Number(multiMatch[1]);
      }

      const aiExtractedJson = {
        summary: email.summary || 'Detail pemesanan operasional CIT/ATM.',
        urgency_level: email.urgency_level || 'Routine',
        action_required: email.action_required || false,
        suggested_tag: email.suggested_tag || 'CIT',
        folder_parent: email.folder_parent || 'Bank Order',
        folder_child: email.folder_child || 'General',
        client_name: clientName,
        cit_type: email.cit_type === 'ATM' ? 'ATM' : 'CIT',
        branch_name: extractedBranch,
        plan_date: new Date().toISOString().split('T')[0],
        trip_type: 'Delivery',
        cycle_type: 'Siklus 1 (Pagi)',
        currency: email.currency || 'IDR',
        total_amount: extractedAmount,
        denomination_suggestion: email.denomination_suggestion || 100000,
        target_tickets: targetTickets,
        processed_tickets: email.processed_tickets || 0,
        order_status: email.order_status || 'PENDING',
        extracted_notes: email.extracted_notes || 'Extracted automatically by AI Operational Copilot.',
        orders_list: Array.from({ length: targetTickets }, (_, i) => ({
          ticket_index: i + 1,
          branch: i === 0 ? extractedBranch : `${extractedBranch} KCP ${i + 1}`,
          client: clientName,
          amount: extractedAmount / (targetTickets > 1 ? targetTickets : 1),
          trip_type: 'Delivery',
          cycle: i % 2 === 0 ? 'Siklus 1 (Pagi)' : 'Siklus 2 (Siang)',
          denom: 100000,
          qty: (extractedAmount / (targetTickets > 1 ? targetTickets : 1)) / 100000
        }))
      };

      res.json({
        success: true,
        raw_email_data: email,
        ai_extracted_json: aiExtractedJson
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  // CIT Master Data Endpoints
  app.get("/api/cit/currencies", async (req, res) => {
    const baseUrl = (process.env.CIT_API_BASE_URL || "https://api-activeatm.adv.my.id").replace(/\/+$/, "");
    const token = getAppSettings().citApiToken || process.env.CIT_API_TOKEN || "";

    try {
      const upstream = await axios.get(`${baseUrl}/api/v1/cit/currencies`, {
        timeout: 15_000,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });

      if (!upstream.data?.success || !Array.isArray(upstream.data?.data)) {
        console.error("[CIT API] Invalid currencies response:", upstream.data);
        return res.status(502).json({
          success: false,
          message: "Format respons master currency dari CIT API tidak valid",
          data: []
        });
      }

      return res.json({
        success: true,
        message: upstream.data.message || "success",
        data: upstream.data.data,
        source: "activeatm"
      });
    } catch (err: any) {
      const upstreamStatus = err.response?.status;
      console.error(`[CIT API] Failed to fetch currencies${upstreamStatus ? ` (HTTP ${upstreamStatus})` : ""}:`, err.message);
      return res.status(502).json({
        success: false,
        message: upstreamStatus
          ? `CIT API menolak permintaan master currency (HTTP ${upstreamStatus})`
          : "Tidak dapat terhubung ke CIT API untuk mengambil master currency",
        data: []
      });
    }
  });

  app.get("/api/cit/scitems", async (req, res) => {
    const baseUrl = (process.env.CIT_API_BASE_URL || "https://api-activeatm.adv.my.id").replace(/\/+$/, "");
    const token = getAppSettings().citApiToken || process.env.CIT_API_TOKEN || "";

    try {
      const upstream = await axios.get(`${baseUrl}/api/v1/cit/scitems`, {
        timeout: 15_000,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });

      if (!upstream.data?.success || !Array.isArray(upstream.data?.data)) {
        console.error("[CIT API] Invalid scitems response:", upstream.data);
        return res.status(502).json({
          success: false,
          message: "Format respons master scitems dari CIT API tidak valid",
          data: []
        });
      }

      return res.json({
        success: true,
        message: upstream.data.message || "success",
        data: upstream.data.data,
        source: "activeatm"
      });
    } catch (err: any) {
      const upstreamStatus = err.response?.status;
      console.error(`[CIT API] Failed to fetch scitems${upstreamStatus ? ` (HTTP ${upstreamStatus})` : ""}:`, err.message);
      return res.status(502).json({
        success: false,
        message: upstreamStatus
          ? `CIT API menolak permintaan master scitems (HTTP ${upstreamStatus})`
          : "Tidak dapat terhubung ke CIT API untuk mengambil master scitems",
        data: []
      });
    }
  });

  // POST Submit CIT Order (Multi-Order Partial Fulfillment)
  app.post("/api/cit/submit-order", async (req, res) => {
    try {
      const {
        message_id,
        ticket_index = 1,
        target_tickets = 1,
        branch_name,
        client_name,
        plan_date,
        trip_type,
        cycle_type,
        currency = 'IDR',
        total_amount,
        items,
        notes
      } = req.body;

      if (!message_id) {
        return res.status(400).json({ success: false, message: "Missing message_id parameter" });
      }

      const email = await dbGetEmailByMessageId(message_id);
      if (!email) {
        return res.status(404).json({ success: false, message: "Email not found" });
      }
      const currentProcessed = email?.processed_tickets || 0;
      const newProcessed = currentProcessed + 1;
      const finalTarget = Number(target_tickets) || email?.target_tickets || 1;
      const newStatus = newProcessed >= finalTarget ? 'COMPLETED' : 'PARTIAL';

      const { dbUpdateEmailFields } = await import("./src/services/dbManager");
      await dbUpdateEmailFields(message_id, {
        target_tickets: finalTarget,
        processed_tickets: newProcessed,
        order_status: newStatus,
        is_cit_order: true,
        api_workflow_status: 'triggered'
      });

      const generatedTicketId = `TKT-${Math.floor(100000 + Math.random() * 900000)}`;

      res.json({
        success: true,
        message: `Tiket #${ticket_index} berhasil disubmit! (${newProcessed}/${finalTarget})`,
        ticket_id: generatedTicketId,
        processed_tickets: newProcessed,
        target_tickets: finalTarget,
        order_status: newStatus,
        next_ticket_index: newProcessed < finalTarget ? newProcessed + 1 : null
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || String(err) });
    }
  });

  app.get("/api/cit/entity-master-details", async (req, res) => {
    const baseUrl = (process.env.CIT_API_BASE_URL || "https://api-activeatm.adv.my.id").replace(/\/+$/, "");
    const token = getAppSettings().citApiToken || process.env.CIT_API_TOKEN || "";

    try {
      const allowedParams = ["branch_code", "entity_code", "entity_name", "page", "size"] as const;
      const params = Object.fromEntries(
        allowedParams
          .filter((key) => req.query[key] !== undefined && req.query[key] !== "")
          .map((key) => [key, req.query[key]])
      );

      const upstream = await axios.get(`${baseUrl}/api/v1/cit/entity-master-details`, {
        timeout: 30_000,
        params,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });

      const pageData = upstream.data?.data;
      if (!upstream.data?.success || !pageData || !Array.isArray(pageData.data)) {
        console.error("[CIT API] Invalid entity-master-details response:", upstream.data);
        return res.status(502).json({
          success: false,
          message: "Format respons entity master dari CIT API tidak valid",
          data: null
        });
      }

      return res.json({
        success: true,
        message: upstream.data.message || "success",
        data: pageData,
        source: "activeatm"
      });
    } catch (err: any) {
      const upstreamStatus = err.response?.status;
      console.error(`[CIT API] Failed to fetch entity-master-details${upstreamStatus ? ` (HTTP ${upstreamStatus})` : ""}:`, err.message);
      return res.status(502).json({
        success: false,
        message: upstreamStatus
          ? `CIT API menolak permintaan entity master (HTTP ${upstreamStatus})`
          : "Tidak dapat terhubung ke CIT API untuk mengambil entity master",
        data: null
      });
    }
  });

  app.get("/api/cit/vault-trips", async (req, res) => {
    const baseUrl = (process.env.CIT_API_BASE_URL || "https://api-activeatm.adv.my.id").replace(/\/+$/, "");
    const token = getAppSettings().citApiToken || process.env.CIT_API_TOKEN || "";

    try {
      const upstream = await axios.get(`${baseUrl}/api/v1/cit/vault-trips`, {
        timeout: 15_000,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });

      if (!upstream.data?.success || !Array.isArray(upstream.data?.data)) {
        console.error("[CIT API] Invalid vault-trips response:", upstream.data);
        return res.status(502).json({
          success: false,
          message: "Format respons vault trips dari CIT API tidak valid",
          data: []
        });
      }

      return res.json({
        success: true,
        message: upstream.data.message || "success",
        data: upstream.data.data,
        source: "activeatm"
      });
    } catch (err: any) {
      const upstreamStatus = err.response?.status;
      console.error(`[CIT API] Failed to fetch vault-trips${upstreamStatus ? ` (HTTP ${upstreamStatus})` : ""}:`, err.message);
      return res.status(502).json({
        success: false,
        message: upstreamStatus
          ? `CIT API menolak permintaan vault trips (HTTP ${upstreamStatus})`
          : "Tidak dapat terhubung ke CIT API untuk mengambil vault trips",
        data: []
      });
    }
  });

  app.get("/api/cit/test-connection", async (req, res) => {
    res.json({
      success: true,
      message: "[CIT API] Forwarding disabled temporarily, data saved to DB only",
      steps: ["API endpoints disabled temporarily."]
    });
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
    res.json({ success: true, data: { id: Math.floor(Math.random() * 1000) + 200 }, message: "Created order mock mode successfully" });
  });

  app.post("/api/cit/create-delivery-detail", async (req, res) => {
    res.json({ success: true, message: "Created order detail mock mode successfully" });
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
