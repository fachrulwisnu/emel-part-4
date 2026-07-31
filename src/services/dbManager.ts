import { getDatabaseConfig, DatabaseConfig } from '../utils/configManager';
import { getMongoDb, closeMongoConnection } from '../lib/mongodb';
import { getPostgresPool, closePostgresPool } from '../lib/postgres';
import { Db } from 'mongodb';
import pg from 'pg';

export interface DbServiceInstance {
  type: 'mongodb' | 'postgres';
  mongoDb: Db | null;
  pgPool: pg.Pool | null;
  config: DatabaseConfig;
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

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('emails');
      await col.updateOne(
        { message_id: messageId },
        { $set: { ...payload, message_id: messageId, updated_at: new Date() } },
        { upsert: true }
      );
      console.log(`[dbManager] Saved email to MongoDB: ${messageId}`);
    } catch (err) {
      console.error(`[dbManager] Failed to save email to MongoDB:`, err);
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      const query = `
        INSERT INTO emails (
          message_id, subject, sender, receiver, date, body_text, html_body, tags,
          category, sub_category, folder_parent, folder_child, attachments,
          is_read, tag_type, summary, action_required, suggested_tag, is_important,
          urgency_level, suggested_folder_parent, suggested_folder_child, is_cit_order,
          cit_type, suggested_bank, extracted_notes, currency, denomination_suggestion,
          total_amount, ai_status, is_summarized, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13,
          $14, $15, $16, $17, $18, $19,
          $20, $21, $22, $23,
          $24, $25, $26, $27, $28,
          $29, $30, $31, CURRENT_TIMESTAMP
        )
        ON CONFLICT(message_id) DO UPDATE SET
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
      console.log(`[dbManager] Saved email to PostgreSQL: ${messageId}`);
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
