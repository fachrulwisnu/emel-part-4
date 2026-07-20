import { getDbDriver, DbDriver } from '../config/dbSwitcher';
import { getSupabaseClient } from '../database-service';
import { getMongoDb } from '../lib/mongodb';
import { SupabaseClient } from '@supabase/supabase-js';
import { Db } from 'mongodb';

export interface DbServiceInstance {
  type: DbDriver;
  supabaseClient: SupabaseClient | null;
  mongoDb: Db | null;
}

/**
 * Returns the currently active database client (Supabase or MongoDB) based on configuration.
 */
export async function getDbService(): Promise<DbServiceInstance> {
  const driver = getDbDriver();
  if (driver === 'mongodb') {
    try {
      const db = await getMongoDb();
      return {
        type: 'mongodb',
        supabaseClient: null,
        mongoDb: db,
      };
    } catch (err) {
      console.error('[dbManager] Failed to get MongoDB connection. Falling back to Supabase...', err);
    }
  }

  // Fallback to Supabase
  return {
    type: 'supabase',
    supabaseClient: getSupabaseClient(),
    mongoDb: null,
  };
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
      console.log(`[dbManager] Successfully saved email to MongoDB: ${messageId}`);
    } catch (err) {
      console.error(`[dbManager] Failed to save email to MongoDB:`, err);
    }
  } else if (dbService.supabaseClient) {
    try {
      const { error } = await dbService.supabaseClient.from('emails').upsert(payload, { onConflict: 'message_id' });
      if (error) {
        console.error(`[dbManager] Supabase save email error:`, error.message);
      }
    } catch (err) {
      console.error(`[dbManager] Supabase save email exception:`, err);
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
  } else if (dbService.supabaseClient) {
    try {
      const { error } = await dbService.supabaseClient
        .from('emails')
        .update({ is_read: isRead })
        .eq('message_id', messageId);
      if (error) {
        console.error(`[dbManager] Supabase update read status error:`, error.message);
      }
    } catch (err) {
      console.error(`[dbManager] Supabase update read status exception:`, err);
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
  } else if (dbService.supabaseClient) {
    try {
      const { error } = await dbService.supabaseClient
        .from('emails')
        .update(updatePayload)
        .eq('message_id', messageId);
      if (error) {
        console.error(`[dbManager] Supabase update email fields error:`, error.message);
      }
    } catch (err) {
      console.error(`[dbManager] Supabase update email fields exception:`, err);
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
  } else if (dbService.supabaseClient) {
    try {
      const { error } = await dbService.supabaseClient.from('emails').delete().neq('id', 0);
      if (error) {
        console.error(`[dbManager] Supabase clear emails error:`, error.message);
      }
    } catch (err) {
      console.error(`[dbManager] Supabase clear emails exception:`, err);
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
      console.log(`[dbManager] Saved email analysis to MongoDB for message_id: ${messageId}`);
    } catch (err) {
      console.error(`[dbManager] Failed to save email analysis to MongoDB:`, err);
    }
  } else if (dbService.supabaseClient) {
    try {
      const { error } = await dbService.supabaseClient.from('email_analysis').upsert(payload, { onConflict: 'message_id' });
      if (error) {
        console.error(`[dbManager] Supabase save email analysis error:`, error.message);
      }
    } catch (err) {
      console.error(`[dbManager] Supabase save email analysis exception:`, err);
    }
  }
}

/**
 * Retrieve specific Email Analysis
 */
export async function dbGetEmailAnalysis(messageId: string): Promise<any | null> {
  const dbService = await getDbService();
  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('email_analysis');
      const data = await col.findOne({ message_id: messageId });
      return data || null;
    } catch (err) {
      console.error(`[dbManager] Failed to get email analysis from MongoDB:`, err);
      return null;
    }
  } else if (dbService.supabaseClient) {
    try {
      const { data, error } = await dbService.supabaseClient
        .from('email_analysis')
        .select('*')
        .eq('message_id', messageId)
        .maybeSingle();
      if (!error && data) {
        return data;
      }
    } catch (err) {
      console.error(`[dbManager] Failed to get email analysis from Supabase:`, err);
    }
  }
  return null;
}

/**
 * Save Custom Filter
 */
export async function dbSaveCustomFilter(payload: any): Promise<void> {
  const dbService = await getDbService();
  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('custom_filters');
      if (payload.id) {
        await col.updateOne(
          { id: payload.id },
          { $set: { ...payload, updated_at: new Date() } },
          { upsert: true }
        );
      } else {
        // Generate automatic number ID
        const lastFilter = await col.find().sort({ id: -1 }).limit(1).toArray();
        const nextId = lastFilter.length > 0 ? (lastFilter[0].id || 0) + 1 : 1;
        payload.id = nextId;
        await col.insertOne({ ...payload, created_at: new Date() });
      }
      console.log(`[dbManager] Saved custom filter to MongoDB.`);
    } catch (err) {
      console.error(`[dbManager] Failed to save custom filter to MongoDB:`, err);
    }
  } else if (dbService.supabaseClient) {
    try {
      const { error } = await dbService.supabaseClient.from('custom_filters').upsert(payload);
      if (error) {
        console.error(`[dbManager] Supabase save custom filter error:`, error.message);
      }
    } catch (err) {
      console.error(`[dbManager] Supabase save custom filter exception:`, err);
    }
  }
}

/**
 * Delete Custom Filter
 */
export async function dbDeleteCustomFilter(id: any): Promise<void> {
  const dbService = await getDbService();
  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('custom_filters');
      const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
      await col.deleteOne({ $or: [{ id: numericId }, { _id: id }] });
      console.log(`[dbManager] Deleted custom filter in MongoDB.`);
    } catch (err) {
      console.error(`[dbManager] Failed to delete custom filter in MongoDB:`, err);
    }
  } else if (dbService.supabaseClient) {
    try {
      const { error } = await dbService.supabaseClient.from('custom_filters').delete().eq('id', id);
      if (error) {
        console.error(`[dbManager] Supabase delete custom filter error:`, error.message);
      }
    } catch (err) {
      console.error(`[dbManager] Supabase delete custom filter exception:`, err);
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
      const data = await col.find().sort({ id: 1 }).toArray();
      return data.map((row: any) => ({
        id: row.id,
        name: row.name || '',
        match_from: row.match_from || '',
        match_subject: row.match_subject || '',
        match_body: row.match_body || '',
        action_parent: row.action_parent || '',
        action_child: row.action_child || '',
        trigger_api: !!row.trigger_api
      }));
    } catch (err) {
      console.error(`[dbManager] Failed to get custom filters from MongoDB:`, err);
      return [];
    }
  } else if (dbService.supabaseClient) {
    try {
      const { data, error } = await dbService.supabaseClient
        .from('custom_filters')
        .select('*')
        .order('id', { ascending: true });
      if (!error && data) {
        return data.map((row: any) => ({
          id: row.id,
          name: row.name || '',
          match_from: row.match_from || '',
          match_subject: row.match_subject || '',
          match_body: row.match_body || '',
          action_parent: row.action_parent || '',
          action_child: row.action_child || '',
          trigger_api: !!row.trigger_api
        }));
      }
    } catch (err) {
      console.error(`[dbManager] Failed to get custom filters from Supabase:`, err);
    }
  }
  return [];
}

// =========================================================================
// WHATSAPP SESSION (wa_sessions) CRUD
// =========================================================================

/**
 * Save/Upsert WhatsApp Session data
 */
export async function dbSaveWaSession(sessionId: string, creds: any): Promise<void> {
  const dbService = await getDbService();
  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('wa_sessions');
      await col.updateOne(
        { session_id: sessionId },
        { $set: { creds, session_id: sessionId, updated_at: new Date() } },
        { upsert: true }
      );
      console.log(`[dbManager] Saved WA Session to MongoDB for ID: ${sessionId}`);
    } catch (err) {
      console.error(`[dbManager] Failed to save WA Session to MongoDB:`, err);
    }
  } else if (dbService.supabaseClient) {
    try {
      const { error } = await dbService.supabaseClient
        .from('wa_sessions')
        .upsert({ session_id: sessionId, creds, updated_at: new Date() }, { onConflict: 'session_id' });
      if (error) {
        console.error(`[dbManager] Supabase save WA Session error:`, error.message);
      }
    } catch (err) {
      console.error(`[dbManager] Supabase save WA Session exception:`, err);
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
  } else if (dbService.supabaseClient) {
    try {
      const { data, error } = await dbService.supabaseClient
        .from('wa_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .maybeSingle();
      if (!error && data) {
        return data.creds;
      }
    } catch (err) {
      console.error(`[dbManager] Failed to get WA Session from Supabase:`, err);
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
  } else if (dbService.supabaseClient) {
    try {
      const { error } = await dbService.supabaseClient
        .from('wa_sessions')
        .delete()
        .eq('session_id', sessionId);
      if (error) {
        console.error(`[dbManager] Supabase delete WA Session error:`, error.message);
      }
    } catch (err) {
      console.error(`[dbManager] Supabase delete WA Session exception:`, err);
    }
  }
}
