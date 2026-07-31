import { getDatabaseConfig, DatabaseConfig } from '../utils/configManager';
import { getMongoDb, closeMongoConnection } from '../lib/mongodb';
import { getPostgresPool, closePostgresPool } from '../lib/postgres';
import { Db } from 'mongodb';
import pg from 'pg';
import bcrypt from 'bcryptjs';

export interface DbServiceInstance {
  type: 'mongodb' | 'postgres';
  mongoDb: Db | null;
  pgPool: pg.Pool | null;
  config: DatabaseConfig;
}

export interface Tenant {
  id: number;
  name: string;
  ai_primary_model: string;
  ai_fallback_model: string;
  ai_models?: string[];
  feature_individual_parsing: boolean;
  feature_bulk_summary: boolean;
  pop3_host?: string;
  pop3_port?: number;
  pop3_user?: string;
  pop3_pass?: string;
  wa_phone?: string;
  admin_email?: string;
  admin_password?: string;
  created_at?: Date | string;
}

export interface User {
  id: number;
  tenant_id: number | null;
  email: string;
  password_hash: string;
  role: 'SUPER_ADMIN' | 'TENANT_ADMIN';
  created_at?: Date | string;
  tenant_name?: string;
}

export interface DailySummary {
  id?: number;
  tenant_id: number;
  summary_date: string;
  content_text: string;
  is_sent_to_wa?: boolean;
  created_at?: Date | string;
}

let lastActiveDriver: 'mongodb' | 'postgres' | null = null;

/**
 * Returns the currently active database client (MongoDB or PostgreSQL) based on config.
 */
export async function getDbService(): Promise<DbServiceInstance> {
  const config = await getDatabaseConfig();
  const driver = config.active_driver;

  // Handle switching if driver changed
  if (lastActiveDriver && lastActiveDriver !== driver) {
    console.log(`[dbManager] Active database changed from ${lastActiveDriver} to ${driver}. Closing old connection...`);
    if (lastActiveDriver === 'mongodb') {
      await closeMongoConnection().catch(() => {});
    } else if (lastActiveDriver === 'postgres') {
      await closePostgresPool().catch(() => {});
    }
  }
  lastActiveDriver = driver;

  if (driver === 'postgres') {
    try {
      const pool = await getPostgresPool(config.connections.postgres);
      return {
        type: 'postgres',
        mongoDb: null,
        pgPool: pool,
        config
      };
    } catch (err) {
      console.error('[dbManager] PostgreSQL connection error, returning fallback instance:', err);
      return {
        type: 'postgres',
        mongoDb: null,
        pgPool: null,
        config
      };
    }
  }

  // Default: MongoDB
  try {
    const db = await getMongoDb(config.connections.mongodb);
    return {
      type: 'mongodb',
      mongoDb: db,
      pgPool: null,
      config
    };
  } catch (err) {
    console.error('[dbManager] MongoDB connection error, returning fallback instance:', err);
    return {
      type: 'mongodb',
      mongoDb: null,
      pgPool: null,
      config
    };
  }
}

// =========================================================================
// UNIFIED CRUD HELPERS
// =========================================================================

/**
 * Save/Upsert an email record
 */
export async function dbSaveEmail(messageId: string, payload: any): Promise<void> {
  const dbService = await getDbService();
  const tenantId = payload.tenant_id !== undefined ? payload.tenant_id : 1;

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('emails');
      await col.updateOne(
        { message_id: messageId },
        { $set: { ...payload, tenant_id: tenantId, message_id: messageId, updated_at: new Date() } },
        { upsert: true }
      );
      console.log(`[dbManager] Saved email to MongoDB: ${messageId} (Tenant ID: ${tenantId})`);
    } catch (err) {
      console.error(`[dbManager] Failed to save email to MongoDB:`, err);
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      const query = `
        INSERT INTO emails (
          tenant_id, message_id, subject, sender, receiver, date, body_text, html_body, tags,
          category, sub_category, folder_parent, folder_child, attachments,
          is_read, tag_type, summary, action_required, suggested_tag, is_important,
          urgency_level, suggested_folder_parent, suggested_folder_child, is_cit_order,
          cit_type, suggested_bank, extracted_notes, currency, denomination_suggestion,
          total_amount, ai_status, is_summarized, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24,
          $25, $26, $27, $28, $29,
          $30, $31, $32, CURRENT_TIMESTAMP
        )
        ON CONFLICT(message_id) DO UPDATE SET
          tenant_id = EXCLUDED.tenant_id,
          subject = EXCLUDED.subject,
          sender = EXCLUDED.sender,
          receiver = EXCLUDED.receiver,
          date = EXCLUDED.date,
          body_text = EXCLUDED.body_text,
          html_body = EXCLUDED.html_body,
          tags = EXCLUDED.tags,
          category = EXCLUDED.category,
          sub_category = EXCLUDED.sub_category,
          folder_parent = EXCLUDED.folder_parent,
          folder_child = EXCLUDED.folder_child,
          attachments = EXCLUDED.attachments,
          is_read = EXCLUDED.is_read,
          tag_type = EXCLUDED.tag_type,
          summary = EXCLUDED.summary,
          action_required = EXCLUDED.action_required,
          suggested_tag = EXCLUDED.suggested_tag,
          is_important = EXCLUDED.is_important,
          urgency_level = EXCLUDED.urgency_level,
          suggested_folder_parent = EXCLUDED.suggested_folder_parent,
          suggested_folder_child = EXCLUDED.suggested_folder_child,
          is_cit_order = EXCLUDED.is_cit_order,
          cit_type = EXCLUDED.cit_type,
          suggested_bank = EXCLUDED.suggested_bank,
          extracted_notes = EXCLUDED.extracted_notes,
          currency = EXCLUDED.currency,
          denomination_suggestion = EXCLUDED.denomination_suggestion,
          total_amount = EXCLUDED.total_amount,
          ai_status = EXCLUDED.ai_status,
          is_summarized = EXCLUDED.is_summarized,
          updated_at = CURRENT_TIMESTAMP;
      `;

      const values = [
        tenantId,
        messageId,
        payload.subject || '',
        payload.sender || '',
        payload.receiver || '',
        payload.date || '',
        payload.body_text || '',
        payload.html_body || '',
        typeof payload.tags === 'string' ? payload.tags : JSON.stringify(payload.tags || []),
        payload.category || 'General',
        payload.sub_category || 'Uncategorized',
        payload.folder_parent || 'Operation',
        payload.folder_child || 'General',
        typeof payload.attachments === 'string' ? payload.attachments : JSON.stringify(payload.attachments || []),
        payload.is_read ? 1 : 0,
        payload.tag_type || '',
        payload.summary || '',
        payload.action_required ? 1 : 0,
        payload.suggested_tag || '',
        payload.is_important ? 1 : 0,
        payload.urgency_level || 'Routine',
        payload.suggested_folder_parent || '',
        payload.suggested_folder_child || '',
        payload.is_cit_order ? 1 : 0,
        payload.cit_type || 'None',
        payload.suggested_bank || '',
        payload.extracted_notes || '',
        payload.currency || 'IDR',
        payload.denomination_suggestion || null,
        payload.total_amount || null,
        payload.ai_status || 'PENDING',
        payload.is_summarized ? 1 : 0
      ];

      await dbService.pgPool.query(query, values);
      console.log(`[dbManager] Saved email to PostgreSQL: ${messageId} (Tenant ID: ${tenantId})`);
    } catch (err) {
      console.error(`[dbManager] Failed to save email to PostgreSQL:`, err);
    }
  }
}

/**
 * Update a specific email's read status
 */
export async function dbUpdateEmailReadStatus(messageId: string, isRead: boolean): Promise<void> {
  const dbService = await getDbService();

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('emails');
      await col.updateOne(
        { message_id: messageId },
        { $set: { is_read: isRead, updated_at: new Date() } }
      );
      console.log(`[dbManager] Updated email read status to ${isRead} in MongoDB: ${messageId}`);
    } catch (err) {
      console.error(`[dbManager] Failed to update read status in MongoDB:`, err);
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      await dbService.pgPool.query(
        'UPDATE emails SET is_read = $1, updated_at = CURRENT_TIMESTAMP WHERE message_id = $2',
        [isRead ? 1 : 0, messageId]
      );
      console.log(`[dbManager] Updated email read status to ${isRead} in PostgreSQL: ${messageId}`);
    } catch (err) {
      console.error(`[dbManager] Failed to update read status in PostgreSQL:`, err);
    }
  }
}

/**
 * Update other specific email fields
 */
export async function dbUpdateEmailFields(messageId: string, updatePayload: any): Promise<void> {
  const dbService = await getDbService();

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('emails');
      await col.updateOne(
        { message_id: messageId },
        { $set: { ...updatePayload, updated_at: new Date() } }
      );
      console.log(`[dbManager] Updated email fields in MongoDB: ${messageId}`);
    } catch (err) {
      console.error(`[dbManager] Failed to update email fields in MongoDB:`, err);
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      const keys = Object.keys(updatePayload);
      if (keys.length === 0) return;

      const setClause = keys.map((key, idx) => `"${key}" = $${idx + 1}`).join(', ');
      const values = keys.map(key => {
        const val = updatePayload[key];
        if (typeof val === 'boolean') return val ? 1 : 0;
        if (typeof val === 'object' && val !== null) return JSON.stringify(val);
        return val;
      });

      values.push(messageId);
      const query = `UPDATE emails SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE message_id = $${keys.length + 1}`;

      await dbService.pgPool.query(query, values);
      console.log(`[dbManager] Updated email fields in PostgreSQL: ${messageId}`);
    } catch (err) {
      console.error(`[dbManager] Failed to update email fields in PostgreSQL:`, err);
    }
  }
}

/**
 * Clear all email records
 */
export async function dbClearAllEmails(): Promise<void> {
  const dbService = await getDbService();

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('emails');
      await col.deleteMany({});
      console.log(`[dbManager] Cleared all emails from MongoDB`);
    } catch (err) {
      console.error(`[dbManager] Failed to clear emails in MongoDB:`, err);
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      await dbService.pgPool.query('DELETE FROM emails');
      console.log(`[dbManager] Cleared all emails from PostgreSQL`);
    } catch (err) {
      console.error(`[dbManager] Failed to clear emails in PostgreSQL:`, err);
    }
  }
}

/**
 * Save/Upsert Email Analysis
 */
export async function dbSaveEmailAnalysis(messageId: string, payload: any): Promise<void> {
  const dbService = await getDbService();

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('email_analysis');
      await col.updateOne(
        { message_id: messageId },
        { $set: { ...payload, message_id: messageId, updated_at: new Date() } },
        { upsert: true }
      );
      console.log(`[dbManager] Saved email analysis to MongoDB: ${messageId}`);
    } catch (err) {
      console.error(`[dbManager] Failed to save email analysis to MongoDB:`, err);
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      const query = `
        INSERT INTO email_analysis (message_id, folder, sub_folder, tags, summary_email, summary_attachments, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        ON CONFLICT(message_id) DO UPDATE SET
          folder = EXCLUDED.folder,
          sub_folder = EXCLUDED.sub_folder,
          tags = EXCLUDED.tags,
          summary_email = EXCLUDED.summary_email,
          summary_attachments = EXCLUDED.summary_attachments,
          updated_at = CURRENT_TIMESTAMP;
      `;
      const values = [
        messageId,
        payload.folder || '',
        payload.sub_folder || '',
        typeof payload.tags === 'string' ? payload.tags : JSON.stringify(payload.tags || []),
        payload.summary_email || '',
        typeof payload.summary_attachments === 'string' ? payload.summary_attachments : JSON.stringify(payload.summary_attachments || [])
      ];
      await dbService.pgPool.query(query, values);
      console.log(`[dbManager] Saved email analysis to PostgreSQL: ${messageId}`);
    } catch (err) {
      console.error(`[dbManager] Failed to save email analysis to PostgreSQL:`, err);
    }
  }
}

/**
 * Get all Custom Filters
 */
export async function dbGetCustomFilters(): Promise<any[]> {
  const dbService = await getDbService();

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('custom_filters');
      return await col.find({}).sort({ id: 1 }).toArray();
    } catch (err) {
      console.error('[dbManager] Failed to get custom filters from MongoDB:', err);
      return [];
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      const res = await dbService.pgPool.query('SELECT * FROM custom_filters ORDER BY id ASC');
      return res.rows;
    } catch (err) {
      console.error('[dbManager] Failed to get custom filters from PostgreSQL:', err);
      return [];
    }
  }
  return [];
}

/**
 * Get Email Analysis for a message
 */
export async function dbGetEmailAnalysis(messageId: string): Promise<any | null> {
  const dbService = await getDbService();

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('email_analysis');
      return await col.findOne({ message_id: messageId });
    } catch (err) {
      console.error('[dbManager] Failed to get email analysis from MongoDB:', err);
      return null;
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      const res = await dbService.pgPool.query('SELECT * FROM email_analysis WHERE message_id = $1', [messageId]);
      return res.rows[0] || null;
    } catch (err) {
      console.error('[dbManager] Failed to get email analysis from PostgreSQL:', err);
      return null;
    }
  }
  return null;
}

/**
 * Save/Upsert Custom Filter rule
 */
export async function dbSaveCustomFilter(payload: any): Promise<void> {
  const dbService = await getDbService();

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('custom_filters');
      if (payload.id) {
        await col.updateOne({ id: payload.id }, { $set: payload }, { upsert: true });
      } else {
        const last = await col.find().sort({ id: -1 }).limit(1).toArray();
        const nextId = (last[0]?.id || 0) + 1;
        await col.insertOne({ ...payload, id: nextId });
      }
      console.log(`[dbManager] Saved custom filter to MongoDB`);
    } catch (err) {
      console.error(`[dbManager] Failed to save custom filter to MongoDB:`, err);
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      if (payload.id) {
        const query = `
          UPDATE custom_filters SET
            name = $1, match_from = $2, match_subject = $3, match_body = $4,
            action_parent = $5, action_child = $6, trigger_api = $7
          WHERE id = $8;
        `;
        await dbService.pgPool.query(query, [
          payload.name, payload.match_from, payload.match_subject, payload.match_body,
          payload.action_parent, payload.action_child, payload.trigger_api ? 1 : 0, payload.id
        ]);
      } else {
        const query = `
          INSERT INTO custom_filters (name, match_from, match_subject, match_body, action_parent, action_child, trigger_api)
          VALUES ($1, $2, $3, $4, $5, $6, $7);
        `;
        await dbService.pgPool.query(query, [
          payload.name, payload.match_from, payload.match_subject, payload.match_body,
          payload.action_parent, payload.action_child, payload.trigger_api ? 1 : 0
        ]);
      }
      console.log(`[dbManager] Saved custom filter to PostgreSQL`);
    } catch (err) {
      console.error(`[dbManager] Failed to save custom filter to PostgreSQL:`, err);
    }
  }
}

/**
 * Delete Custom Filter rule
 */
export async function dbDeleteCustomFilter(id: number): Promise<void> {
  const dbService = await getDbService();

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('custom_filters');
      await col.deleteOne({ id });
      console.log(`[dbManager] Deleted custom filter in MongoDB: ${id}`);
    } catch (err) {
      console.error(`[dbManager] Failed to delete custom filter in MongoDB:`, err);
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      await dbService.pgPool.query('DELETE FROM custom_filters WHERE id = $1', [id]);
      console.log(`[dbManager] Deleted custom filter in PostgreSQL: ${id}`);
    } catch (err) {
      console.error(`[dbManager] Failed to delete custom filter in PostgreSQL:`, err);
    }
  }
}

/**
 * Store WhatsApp Session data
 */
export async function dbSaveWaSession(sessionId: string, creds: any): Promise<void> {
  const dbService = await getDbService();

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('wa_sessions');
      await col.updateOne(
        { session_id: sessionId },
        { $set: { session_id: sessionId, creds, updated_at: new Date() } },
        { upsert: true }
      );
    } catch (err) {
      console.error(`[dbManager] Failed to save WA Session in MongoDB:`, err);
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      const query = `
        INSERT INTO wa_sessions (session_id, creds, updated_at)
        VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
        ON CONFLICT(session_id) DO UPDATE SET creds = $2::jsonb, updated_at = CURRENT_TIMESTAMP;
      `;
      await dbService.pgPool.query(query, [sessionId, JSON.stringify(creds)]);
    } catch (err) {
      console.error(`[dbManager] Failed to save WA Session in PostgreSQL:`, err);
    }
  }
}

/**
 * Retrieve WhatsApp Session data
 */
export async function dbGetWaSession(sessionId: string): Promise<any | null> {
  const dbService = await getDbService();

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('wa_sessions');
      const data = await col.findOne({ session_id: sessionId });
      return data ? data.creds : null;
    } catch (err) {
      console.error(`[dbManager] Failed to get WA Session from MongoDB:`, err);
      return null;
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      const res = await dbService.pgPool.query('SELECT creds FROM wa_sessions WHERE session_id = $1', [sessionId]);
      if (res.rows.length > 0) {
        return typeof res.rows[0].creds === 'string' ? JSON.parse(res.rows[0].creds) : res.rows[0].creds;
      }
    } catch (err) {
      console.error(`[dbManager] Failed to get WA Session from PostgreSQL:`, err);
    }
  }
  return null;
}

/**
 * Delete WhatsApp Session data
 */
export async function dbDeleteWaSession(sessionId: string): Promise<void> {
  const dbService = await getDbService();

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('wa_sessions');
      await col.deleteOne({ session_id: sessionId });
      console.log(`[dbManager] Deleted WA Session in MongoDB for ID: ${sessionId}`);
    } catch (err) {
      console.error(`[dbManager] Failed to delete WA Session in MongoDB:`, err);
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      await dbService.pgPool.query('DELETE FROM wa_sessions WHERE session_id = $1', [sessionId]);
      console.log(`[dbManager] Deleted WA Session in PostgreSQL for ID: ${sessionId}`);
    } catch (err) {
      console.error(`[dbManager] Failed to delete WA Session in PostgreSQL:`, err);
    }
  }
}

// =========================================================================
// SAAS MULTI-TENANT HELPERS (TENANTS, USERS, DAILY SUMMARIES)
// =========================================================================

/**
 * Get all Tenants (with admin user email mapping)
 */
export async function dbGetTenants(): Promise<Tenant[]> {
  const dbService = await getDbService();

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('tenants');
      let tenants = await col.find().sort({ id: 1 }).toArray();
      if (!tenants || tenants.length === 0) {
        // Seed default tenants if empty
        const defaultTenants: Tenant[] = [
          { id: 1, name: 'COS', ai_primary_model: 'Custom AI Core', ai_fallback_model: 'Nemotron 3 Super 120B', ai_models: ['Custom AI Core', 'Nemotron 3 Super 120B', 'Custom AI Vision'], feature_individual_parsing: true, feature_bulk_summary: false, pop3_host: 'pop.secureserver.net', pop3_port: 110, pop3_user: 'cos@corporate.com', pop3_pass: '••••••••', wa_phone: '6281234567890' },
          { id: 2, name: 'RH', ai_primary_model: 'Custom AI Core', ai_fallback_model: 'Nemotron 3 Super 120B', ai_models: ['Custom AI Core', 'Qwen3 Next 80B'], feature_individual_parsing: false, feature_bulk_summary: true, pop3_host: 'pop.secureserver.net', pop3_port: 110, pop3_user: 'rh@corporate.com', pop3_pass: '••••••••', wa_phone: '6289876543210' },
          { id: 3, name: 'BM', ai_primary_model: 'Custom AI Core', ai_fallback_model: 'Nemotron 3 Super 120B', ai_models: ['Custom AI Core', 'StepFun AI Step 3.7 Flash'], feature_individual_parsing: false, feature_bulk_summary: true, pop3_host: 'pop.secureserver.net', pop3_port: 110, pop3_user: 'bm@corporate.com', pop3_pass: '••••••••', wa_phone: '628555666777' }
        ];
        await col.insertMany(defaultTenants as any);
        tenants = defaultTenants as any;
      }
      const usersCol = dbService.mongoDb.collection('users');
      const users = await usersCol.find({ role: 'TENANT_ADMIN' }).toArray();

      return tenants.map((t: any) => {
        const admin = users.find((u: any) => u.tenant_id === t.id);
        return {
          id: t.id,
          name: t.name,
          ai_primary_model: t.ai_primary_model || 'Custom AI Core',
          ai_fallback_model: t.ai_fallback_model || 'Nemotron 3 Super 120B',
          ai_models: Array.isArray(t.ai_models) ? t.ai_models : (t.ai_primary_model ? [t.ai_primary_model, t.ai_fallback_model].filter(Boolean) : ['Custom AI Core']),
          feature_individual_parsing: !!t.feature_individual_parsing,
          feature_bulk_summary: !!t.feature_bulk_summary,
          pop3_host: t.pop3_host || '',
          pop3_port: t.pop3_port || 110,
          pop3_user: t.pop3_user || '',
          pop3_pass: t.pop3_pass || '',
          wa_phone: t.wa_phone || '',
          admin_email: admin ? admin.email : (t.admin_email || `${t.name.toLowerCase()}@corporate.com`),
          created_at: t.created_at
        };
      });
    } catch (err) {
      console.error('[dbManager] Failed to get tenants from MongoDB:', err);
      return [];
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      const query = `
        SELECT t.*, u.email as admin_email
        FROM public.tenants t
        LEFT JOIN public.users u ON u.tenant_id = t.id AND u.role = 'TENANT_ADMIN'
        ORDER BY t.id ASC;
      `;
      const res = await dbService.pgPool.query(query);
      return res.rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        ai_primary_model: row.ai_primary_model || 'Custom AI Core',
        ai_fallback_model: row.ai_fallback_model || 'Nemotron 3 Super 120B',
        ai_models: Array.isArray(row.ai_models) 
          ? row.ai_models 
          : (typeof row.ai_models === 'string' ? JSON.parse(row.ai_models) : [row.ai_primary_model || 'Custom AI Core']),
        feature_individual_parsing: !!row.feature_individual_parsing,
        feature_bulk_summary: !!row.feature_bulk_summary,
        pop3_host: row.pop3_host || '',
        pop3_port: row.pop3_port || 110,
        pop3_user: row.pop3_user || '',
        pop3_pass: row.pop3_pass || '',
        wa_phone: row.wa_phone || '',
        admin_email: row.admin_email || `${row.name.toLowerCase()}@corporate.com`,
        created_at: row.created_at
      }));
    } catch (err) {
      console.error('[dbManager] Failed to get tenants from PostgreSQL:', err);
      return [];
    }
  }
  return [];
}

/**
 * Get Tenant by ID
 */
export async function dbGetTenantById(id: number): Promise<Tenant | null> {
  const tenants = await dbGetTenants();
  return tenants.find(t => t.id === Number(id)) || null;
}

/**
 * Insert or Update Tenant with Transactional Admin User Creation
 */
export async function dbSaveTenant(payload: Partial<Tenant> & { admin_email?: string; admin_password?: string }): Promise<Tenant | null> {
  const dbService = await getDbService();

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('tenants');
      const usersCol = dbService.mongoDb.collection('users');
      let tenantId = payload.id;
      let newTenant: any;

      const { admin_email, admin_password, ...cleanPayload } = payload;

      if (tenantId) {
        await col.updateOne({ id: tenantId }, { $set: cleanPayload }, { upsert: true });
        newTenant = await col.findOne({ id: tenantId });
      } else {
        const last = await col.find().sort({ id: -1 }).limit(1).toArray();
        tenantId = (last[0]?.id || 0) + 1;
        newTenant = { ...cleanPayload, id: tenantId, created_at: new Date() };
        await col.insertOne(newTenant);
      }

      if (admin_email && admin_password) {
        const hash = bcrypt.hashSync(admin_password, 10);
        await usersCol.updateOne(
          { email: admin_email },
          {
            $set: {
              tenant_id: tenantId,
              email: admin_email,
              password_hash: hash,
              role: 'TENANT_ADMIN',
              updated_at: new Date()
            }
          },
          { upsert: true }
        );
      }

      return {
        ...newTenant,
        admin_email: admin_email || newTenant.admin_email || ''
      };
    } catch (err) {
      console.error('[dbManager] Failed to save tenant in MongoDB:', err);
      return null;
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    const client = await dbService.pgPool.connect();
    try {
      await client.query('BEGIN');

      const aiModelsJson = JSON.stringify(payload.ai_models || ['Custom AI Core']);
      let tenantRow: any;

      if (payload.id) {
        const query = `
          UPDATE public.tenants SET
            name = COALESCE($1, name),
            ai_primary_model = COALESCE($2, ai_primary_model),
            ai_fallback_model = COALESCE($3, ai_fallback_model),
            ai_models = COALESCE($4::jsonb, ai_models),
            feature_individual_parsing = COALESCE($5, feature_individual_parsing),
            feature_bulk_summary = COALESCE($6, feature_bulk_summary),
            pop3_host = COALESCE($7, pop3_host),
            pop3_port = COALESCE($8, pop3_port),
            pop3_user = COALESCE($9, pop3_user),
            pop3_pass = COALESCE($10, pop3_pass),
            wa_phone = COALESCE($11, wa_phone)
          WHERE id = $12
          RETURNING *;
        `;
        const res = await client.query(query, [
          payload.name, payload.ai_primary_model, payload.ai_fallback_model,
          aiModelsJson,
          payload.feature_individual_parsing, payload.feature_bulk_summary,
          payload.pop3_host, payload.pop3_port, payload.pop3_user, payload.pop3_pass, payload.wa_phone,
          payload.id
        ]);
        tenantRow = res.rows[0];
      } else {
        const query = `
          INSERT INTO public.tenants (name, ai_primary_model, ai_fallback_model, ai_models, feature_individual_parsing, feature_bulk_summary, pop3_host, pop3_port, pop3_user, pop3_pass, wa_phone)
          VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11)
          RETURNING *;
        `;
        const res = await client.query(query, [
          payload.name,
          payload.ai_primary_model || 'Custom AI Core',
          payload.ai_fallback_model || 'Nemotron 3 Super 120B',
          aiModelsJson,
          !!payload.feature_individual_parsing,
          !!payload.feature_bulk_summary,
          payload.pop3_host || '',
          payload.pop3_port || 110,
          payload.pop3_user || '',
          payload.pop3_pass || '',
          payload.wa_phone || ''
        ]);
        tenantRow = res.rows[0];
      }

      if (!tenantRow) {
        throw new Error('Gagal menyimpan atau memperbarui data divisi tenant.');
      }

      // Handle Admin User Creation / Update in Transaction
      if (payload.admin_email && payload.admin_password) {
        const hash = bcrypt.hashSync(payload.admin_password, 10);
        const userQuery = `
          INSERT INTO public.users (tenant_id, email, password_hash, role)
          VALUES ($1, $2, $3, 'TENANT_ADMIN')
          ON CONFLICT (email) DO UPDATE SET
            password_hash = EXCLUDED.password_hash,
            tenant_id = EXCLUDED.tenant_id,
            role = 'TENANT_ADMIN';
        `;
        await client.query(userQuery, [tenantRow.id, payload.admin_email, hash]);
      }

      await client.query('COMMIT');
      return {
        ...tenantRow,
        admin_email: payload.admin_email || tenantRow.admin_email || ''
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      console.error('[dbManager] Transaction failed saving tenant in PostgreSQL:', err);
      throw err;
    } finally {
      client.release();
    }
  }
  return null;
}

/**
 * Delete Tenant
 */
export async function dbDeleteTenant(id: number): Promise<boolean> {
  const dbService = await getDbService();

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      await dbService.mongoDb.collection('tenants').deleteOne({ id: Number(id) });
      return true;
    } catch (err) {
      console.error('[dbManager] Failed to delete tenant from MongoDB:', err);
      return false;
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      await dbService.pgPool.query('DELETE FROM public.tenants WHERE id = $1', [id]);
      return true;
    } catch (err) {
      console.error('[dbManager] Failed to delete tenant from PostgreSQL:', err);
      return false;
    }
  }
  return false;
}

/**
 * Get User by Email
 */
export async function dbGetUserByEmail(email: string): Promise<User | null> {
  const dbService = await getDbService();

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('users');
      let user = await col.findOne({ email });
      if (!user) {
        // Seed default users if empty
        const count = await col.countDocuments();
        if (count === 0) {
          const defaultUsers = [
            { id: 1, tenant_id: null, email: 'fachrul', password_hash: bcrypt.hashSync('bosskubabi', 10), role: 'SUPER_ADMIN' },
            { id: 2, tenant_id: 1, email: 'cos', password_hash: bcrypt.hashSync('12345678', 10), role: 'TENANT_ADMIN' }
          ];
          await col.insertMany(defaultUsers as any);
          if (email === 'fachrul') user = defaultUsers[0] as any;
          if (email === 'cos') user = defaultUsers[1] as any;
        }
      }
      if (user) {
        let tenant_name = 'SUPER ADMIN';
        if (user.tenant_id) {
          const tenant = await dbGetTenantById(user.tenant_id);
          if (tenant) tenant_name = tenant.name;
        }
        return {
          id: user.id,
          tenant_id: user.tenant_id || null,
          email: user.email,
          password_hash: user.password_hash,
          role: user.role,
          created_at: user.created_at,
          tenant_name
        };
      }
    } catch (err) {
      console.error('[dbManager] Failed to get user by email from MongoDB:', err);
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      const query = `
        SELECT u.*, t.name as tenant_name
        FROM public.users u
        LEFT JOIN public.tenants t ON u.tenant_id = t.id
        WHERE u.email = $1;
      `;
      const res = await dbService.pgPool.query(query, [email]);
      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          id: row.id,
          tenant_id: row.tenant_id || null,
          email: row.email,
          password_hash: row.password_hash,
          role: row.role,
          created_at: row.created_at,
          tenant_name: row.role === 'SUPER_ADMIN' ? 'SUPER ADMIN' : (row.tenant_name || 'Division')
        };
      }
    } catch (err) {
      console.error('[dbManager] Failed to get user by email from PostgreSQL:', err);
    }
  }
  return null;
}

/**
 * Validate User Credentials
 */
export async function dbValidateUserCredentials(email: string, password: string): Promise<User | null> {
  const user = await dbGetUserByEmail(email);
  if (!user) return null;

  const matches = bcrypt.compareSync(password, user.password_hash);
  if (matches) {
    return user;
  }
  return null;
}

/**
 * Save / Get Daily Summaries
 */
export async function dbSaveDailySummary(summary: DailySummary): Promise<void> {
  const dbService = await getDbService();

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('daily_summaries');
      await col.insertOne({
        ...summary,
        created_at: new Date()
      });
      console.log(`[dbManager] Saved Daily Summary in MongoDB for Tenant ID: ${summary.tenant_id}`);
    } catch (err) {
      console.error('[dbManager] Failed to save Daily Summary in MongoDB:', err);
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      const query = `
        INSERT INTO public.daily_summaries (tenant_id, summary_date, content_text, is_sent_to_wa)
        VALUES ($1, $2, $3, $4);
      `;
      await dbService.pgPool.query(query, [
        summary.tenant_id,
        summary.summary_date,
        summary.content_text,
        !!summary.is_sent_to_wa
      ]);
      console.log(`[dbManager] Saved Daily Summary in PostgreSQL for Tenant ID: ${summary.tenant_id}`);
    } catch (err) {
      console.error('[dbManager] Failed to save Daily Summary in PostgreSQL:', err);
    }
  }
}

/**
 * Get Daily Summaries for Tenant
 */
export async function dbGetDailySummaries(tenantId?: number): Promise<DailySummary[]> {
  const dbService = await getDbService();

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('daily_summaries');
      const query = tenantId ? { tenant_id: Number(tenantId) } : {};
      const res = await col.find(query).sort({ created_at: -1 }).toArray();
      return res.map((r: any) => ({
        id: r._id,
        tenant_id: r.tenant_id,
        summary_date: r.summary_date,
        content_text: r.content_text,
        is_sent_to_wa: !!r.is_sent_to_wa,
        created_at: r.created_at
      }));
    } catch (err) {
      console.error('[dbManager] Failed to get Daily Summaries from MongoDB:', err);
      return [];
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      const query = tenantId
        ? 'SELECT * FROM public.daily_summaries WHERE tenant_id = $1 ORDER BY created_at DESC'
        : 'SELECT * FROM public.daily_summaries ORDER BY created_at DESC';
      const values = tenantId ? [tenantId] : [];
      const res = await dbService.pgPool.query(query, values);
      return res.rows.map((row: any) => ({
        id: row.id,
        tenant_id: row.tenant_id,
        summary_date: row.summary_date,
        content_text: row.content_text,
        is_sent_to_wa: !!row.is_sent_to_wa,
        created_at: row.created_at
      }));
    } catch (err) {
      console.error('[dbManager] Failed to get Daily Summaries from PostgreSQL:', err);
      return [];
    }
  }
  return [];
}
