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

export interface TenantPermissions {
  dashboard: boolean;
  cit_dispatch: boolean;
  daily_summary: boolean;
  mail_wa_setup: boolean;
  dynamic_filters: boolean;
  order_input_read?: boolean;
  order_input_create?: boolean;
  order_input_update?: boolean;
  order_input_delete?: boolean;
}

export interface DynamicFilterRule {
  id?: number;
  tenant_id?: number;
  emails: string;
  region: string;
  branch: string;
  created_at?: string;
}

export const SEED_DYNAMIC_FILTERS_DATA = [
  // REGION 1
  { emails: 'palembang,agus@advantagescm.com,Muzni.Purbajanti@danamon.co.id, yosepha.valentine@hanabank.co.id,leonard.s@cimbniaga.co.id,cpc.palembang@advantagescm.com,tommy.parlindungan@advantagescm.com', region: 'REGION 1', branch: 'PALEMBANG' },
  { emails: 'hasni@banksinarmas.com,mellisa_can@bca.co.id,hendrawan_sucanto@bca.co.id,maulana.pohan@smbci.com,sihar.sinaga@danamon.co.id,CCM.Medan@permatabank.co.id,APasaribu@maybank.co.id,cpccit.medan@advantagescm.com', region: 'REGION 1', branch: 'MEDAN' },
  { emails: 'tantin@panin.co.id,hrrfebriansyah@gmail.com,NRomantias@maybank.co.id,WSanti@maybank.co.id,Bambang.Kismoyo@smbci.com,advantage.batam@advantagescm.com,surachman@panin.co.id', region: 'REGION 1', branch: 'BATAM' },
  { emails: 'dandy.alfianto@advantagescm.com', region: 'REGION 1', branch: 'RAWAMANGUN' },
  { emails: 'yanto.055@bankmega.com,eko.adrianto@bankmega.com,betty@banksinarmas.com,Fransiskus.ADB@danamon.co.id,cashdelivery@permatabank.co.id,fandy.fandy@panin.co.id,Regina.Pasaribu@danamon.co.id,cpc.jambi@advantagescm.com', region: 'REGION 1', branch: 'JAMBI' },
  { emails: 'yuli_malisa@bca.co.id, nikaga.k.ceullar@banksinarmas.com, agil.fazrul@advantagescm.com,Dini.Sartika@cimbniaga.co.id,pebrina.djafri@danamon.co.id,anastasya_aurellia@bca.co.id', region: 'REGION 1', branch: 'PADANG' },
  { emails: 'YAnggraini@maybank.co.id,tella_chantika@bca.co.id,Rezki.DresMili@btpnsyariah.com,muhammad.rezki@danamon.co.id,wahyu.novita@advantagescm.com,cit.pekanbaru@advantagescm.com', region: 'REGION 1', branch: 'PEKANBARU' },
  // REGION 2
  { emails: 'yulia.sandra@bankmega.com,j.sisca@maybank.co.id,kabagops_pij@nobubank.com,ALLTL.Pontianak@advantagescm.com,YNovitasari@maybank.co.id,Vivi.Chandra@cimbniaga.co.id,elfrida.pangaribuan@danamon.co.id,Desi.Fransiska@uob.co.id,Stevy.Rompas@danamon.co.id,Fitria@smbci.com', region: 'REGION 2', branch: 'PONTIANAK' },
  { emails: 'cpc.balikpapan@advantagescm.com,adv.balikpapan@advantagescm.com', region: 'REGION 2', branch: 'BALIKPAPAN' },
  { emails: 'adv.samarinda@advantagescm.com,fitria_abbas@bca.co.id,mezayu_gustien@bca.co.id,Novida-s@maybank.co.id,artha.sanjaya@ocbc.id,Erikson.Sagala@ocbc.id, nani.januari@smbci.com,Heni.Novitasari2@btpnsyariah.com', region: 'REGION 2', branch: 'SAMARINDA' },
  { emails: 'ops.banjarmasin@advantagescm.com,carolina_nugroho@bca.co.id,CCM.Banjarmasin@permatabank.co.id,Imelda.Butarbutar@smbci.com', region: 'REGION 2', branch: 'BANJARMASIN' },
  { emails: 'ops.singkawang@advantagescm.com', region: 'REGION 2', branch: 'SINGKAWANG' },
  // REGION 3
  { emails: 'HNovita@maybank.co.id, Regina.Arini@UOB.CO.ID,opscitjkt@advantagescm.com, tb.cashpickup@danamon.co.id, NYunistira@maybank.co.id,Chatarina.Sagala@danamon.co.id, elvira.zefanya@hanabank.co.id, syarip.hidayatulloh@danamon.co.id, Veronika.Alfiyanti@danamon.co.id,nuraeni.nuraeni@hanabank.co.id,kusdi.anto@danamon.co.id,annisa.retno@bankganesha.co.id,dendy.akbar@bankmuamalat.co.id,rospita.maria@hanabank.co.id, lidwina.astrid@hanabank.co.id,windi.eka@hanabank.co.id,inneke.hardiyanti@hanabank.co.id,septia.dahlia@hanabank.co.id,Raden.Sinurat@UOB.CO.ID,kemang.setiaji@advantagescm.com,Tonny.7034@UOB.CO.ID,yosua.chandra@hibank.co.id,nunik@sbiindo.com,gesti@hanabank.co.id,csh@bankmega.com', region: 'REGION 3', branch: 'MERUYA' },
  { emails: 'Dian.Meivirina@btpnsyariah.com,candini@maybank.co.id,cpc.bengkulu@advantagescm.com', region: 'REGION 3', branch: 'BENGKULU' },
  { emails: 'indra_putra@bca.co.id,martono_kusen@bca.co.id,Fuadi.Akbar@danamon.co.id,  yuvita_dewi@bca.co.id,antonius.bambang@danamon.co.id,tiffany_marvin@bca.co.id,ilham.akbar@bankmega.com,gabriela.grand@idn.ccb.com', region: 'REGION 3', branch: 'LAMPUNG' },
  { emails: 'nirawati@BANKBJB.CO.ID', region: 'REGION 3', branch: 'SERANG' },
  // REGION 4
  { emails: 'netops.denpasar@permatabank.co.id,IGM.Sutadnyana@cimbniaga.co.id,mike.cahya@bankmega.com', region: 'REGION 4', branch: 'DENPASAR' },
  { emails: 'Yuliana@btpnsyariah.com, siska.dillak@bankmega.com,Wahyu.Setiawan@danamon.co.id', region: 'REGION 4', branch: 'KUPANG' },
  { emails: 'CCM.Kliring.Bandung@permatabank.co.id,hendra.hermawan@hanabank.co.id,supri.yatna@advantagescm.com,ela.laelawati@bankmega.com,Mia.Hermina@smbci.com,YNovyanti@maybank.co.id', region: 'REGION 4', branch: 'BANDUNG' },
  { emails: 'muhamad.sukardi@advantagescm.com,Nimade.Suartini@danamon.co.id,elika.aisa@bankmuamalat.co.id,cpc.mataram@advantagescm.com,cpc.mataram@advantagescm.btpn', region: 'REGION 4', branch: 'MATARAM' },
  { emails: 'netops.manado@permatabank.co.id,Kevin.Tengor@smbci.com', region: 'REGION 4', branch: 'MANADO' },
  { emails: 'kabagops_cys@nobubank.com', region: 'REGION 4', branch: 'CIREBON' },
  // REGION 5
  { emails: 'smg.opr@bankmayapada.com,DaniaKusuma.Dewi@smbci.com,tiffany_irawan@bca.co.id,fahrizal_nugroho@bca.co.id,donny.fardan@cimbniaga.co.id,DRArumdati@maybank.co.id,ong_rukmanto@bca.co.id, roatut.toyyibah@bankmuamalat.co.id,cdc.semarang@advantagescm.com,admincdc.smg@advantagescm.com,cpc.semarang@advantagescm.com', region: 'REGION 5', branch: 'SEMARANG' },
  { emails: 'beny.susantyo@danamon.co.id,ncm_slo_sriyadi@cimbniaga.co.id,cdc.solo@advantagescm.com,Agung.Subagio@smbci.com', region: 'REGION 5', branch: 'SOLO' },
  { emails: 'hc_rosanadewi@yahoo.com,joko.setiyawan@bankmega.com,fitra.kurniawan@bankmega.com,HATresna@maybank.co.id', region: 'REGION 5', branch: 'TEGAL' },
  { emails: 'febrina.punggawati@bankmas.co.id,cpc.yogya@advantagescm.com,andri.a@advantagescm.com', region: 'REGION 5', branch: 'YOGYAKARTA' },
  { emails: 'windya@cimbniaga.co.id', region: 'REGION 5', branch: 'PURWOKERTO' },
  { emails: 'cpc.kudus@advantagescm.com', region: 'REGION 5', branch: 'KUDUS' },
  // REGION 6
  { emails: 'Santalia.Sikku@cimbniaga.co.id,Sahrur.Sanusi@cimbniaga.co.id,Lisa.Oktaviani@maybank.co.id,agustinus.dendang@danamon.co.id,harmedi.harmedi@bankmega.com,ST.Mariana@btpnsyariah.com', region: 'REGION 6', branch: 'MAKASSAR' },
  { emails: 'ekky.budi@advantagescm.com,cit.kediri@advantagescm.com', region: 'REGION 6', branch: 'KEDIRI' },
  { emails: 'aazas@maybank.co.id,cit.jember@advantagescm.com,Hanafi@smbci.com', region: 'REGION 6', branch: 'JEMBER' },
  { emails: 'elly.ongkojoyo@hanabank.co.id,andre.fiorntino@bankmas.co.id,Wahyudi.Cahyono@cimbniaga.co.id,fitra.kurniawan@bankmega.com,Vicky.Rubiyanto@maybank.co.id,dicky.hidayat@danamon.co.id', region: 'REGION 6', branch: 'SURABAYA' },
  { emails: 'Dady.Lumenta@smbci.com,arnold_boksman@bca.co.id', region: 'REGION 6', branch: 'MANADO' },
  { emails: 'adv.malang@advantagescm.com,cit.malang@advantagescm.com,Adrian.Kusuma@smbci.com,ari.pebriansyah@advantagescm.com', region: 'REGION 6', branch: 'MALANG' }
];

export const DEFAULT_TENANT_PERMISSIONS: TenantPermissions = {
  dashboard: true,
  cit_dispatch: true,
  daily_summary: true,
  mail_wa_setup: true,
  dynamic_filters: true
};

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
  permissions?: TenantPermissions;
  created_at?: Date | string;
}

export interface MailConfig {
  id?: number;
  tenant_id: number;
  email_address: string;
  host: string;
  port: number;
  username: string;
  password: string;
  is_active?: boolean;
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
  permissions?: TenantPermissions;
}

export interface DailySummary {
  id?: number | string;
  tenant_id: number;
  summary_date: string;
  content_text: string;
  is_sent_to_wa?: boolean;
  source_email_ids?: string[];
  source_emails?: any[];
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
    } catch (err: any) {
      console.warn(`[dbManager] PostgreSQL connection unavailable: ${err.message || String(err)}. Falling back to MongoDB/SQLite storage engine.`);
    }
  }

  // Fallback: MongoDB / Local Storage
  try {
    const db = await getMongoDb(config.connections.mongodb);
    return {
      type: 'mongodb',
      mongoDb: db,
      pgPool: null,
      config
    };
  } catch (err: any) {
    console.warn(`[dbManager] MongoDB connection notice: ${err.message || String(err)}. Using fallback local storage engine.`);
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
          total_amount, ai_status, is_summarized, source_email, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24,
          $25, $26, $27, $28, $29,
          $30, $31, $32, $33, CURRENT_TIMESTAMP
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
          source_email = EXCLUDED.source_email,
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
        payload.is_summarized ? 1 : 0,
        payload.source_email || ''
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
export async function dbUpdateEmailFields(messageId: string, updatePayload: any): Promise<boolean> {
  const dbService = await getDbService();

  // Helper sanitasi angka murni untuk PostgreSQL BIGINT
  const extractNumber = (val: any): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : Math.floor(val);
    const cleaned = String(val).replace(/[^0-9]/g, '');
    return cleaned ? Number(cleaned) : 0;
  };

  if (updatePayload) {
    if (updatePayload.total_amount !== undefined) {
      updatePayload.total_amount = extractNumber(updatePayload.total_amount);
    }
    if (updatePayload.denomination_suggestion !== undefined) {
      updatePayload.denomination_suggestion = extractNumber(updatePayload.denomination_suggestion);
    }
    if (updatePayload.denomination_breakdown !== undefined) {
      let rawBreakdown = updatePayload.denomination_breakdown;
      if (typeof rawBreakdown === 'string') {
        try { rawBreakdown = JSON.parse(rawBreakdown); } catch { rawBreakdown = {}; }
      }
      if (typeof rawBreakdown === 'object' && rawBreakdown !== null) {
        const cleanBreakdown: Record<string, number> = {};
        for (const [k, v] of Object.entries(rawBreakdown)) {
          const cleanK = extractNumber(k);
          const cleanV = extractNumber(v);
          if (cleanK > 0) cleanBreakdown[cleanK] = cleanV;
        }
        updatePayload.denomination_breakdown = cleanBreakdown;
      }
    }
  }

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('emails');
      await col.updateOne(
        { message_id: messageId },
        { $set: { ...updatePayload, updated_at: new Date() } }
      );
      return true;
    } catch (err) {
      console.error(`[dbManager] Failed to update email fields in MongoDB:`, err);
      return false;
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      const keys = Object.keys(updatePayload);
      if (keys.length === 0) return true;

      const setClause = keys.map((key, idx) => `"${key}" = $${idx + 1}`).join(', ');
      const values = keys.map(key => {
        const val = updatePayload[key];
        if (typeof val === 'boolean') return val;
        if (typeof val === 'object' && val !== null) return JSON.stringify(val);
        return val;
      });

      values.push(messageId);
      const query = `UPDATE emails SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE message_id = $${keys.length + 1} OR id::text = $${keys.length + 1}`;

      await dbService.pgPool.query(query, values);
      return true;
    } catch (err) {
      console.error(`[dbManager] Failed to update email fields in PostgreSQL:`, err);
      return false;
    }
  }
  return false;
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
        // Seed default tenant (COS) if empty
        const defaultTenants: Tenant[] = [
          { 
            id: 1, 
            name: 'COS', 
            ai_primary_model: 'Custom AI Core', 
            ai_fallback_model: 'Nemotron 3 Super 120B', 
            ai_models: ['Custom AI Core', 'Nemotron 3 Super 120B', 'Custom AI Vision'], 
            feature_individual_parsing: true, 
            feature_bulk_summary: false, 
            pop3_host: 'pop.secureserver.net', 
            pop3_port: 110, 
            pop3_user: 'cos@corporate.com', 
            pop3_pass: '••••••••', 
            wa_phone: '6281234567890',
            permissions: DEFAULT_TENANT_PERMISSIONS
          }
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
          permissions: t.permissions || DEFAULT_TENANT_PERMISSIONS,
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
      const tenantRows = res.rows.map((row: any) => ({
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
        permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : (row.permissions || DEFAULT_TENANT_PERMISSIONS),
        created_at: row.created_at
      }));
      if (tenantRows.length > 0) return tenantRows;
    } catch (err) {
      console.warn('[dbManager] PostgreSQL tenants query failed, using default fallback tenant:', err);
    }
  }

  // Fallback default tenant if no database records are found
  return [
    { 
      id: 1, 
      name: 'COS', 
      ai_primary_model: 'Custom AI Core', 
      ai_fallback_model: 'Nemotron 3 Super 120B', 
      ai_models: ['Custom AI Core', 'Nemotron 3 Super 120B', 'Custom AI Vision'], 
      feature_individual_parsing: true, 
      feature_bulk_summary: false, 
      pop3_host: 'pop.secureserver.net', 
      pop3_port: 110, 
      pop3_user: 'cos@corporate.com', 
      pop3_pass: '••••••••', 
      wa_phone: '6281234567890',
      permissions: DEFAULT_TENANT_PERMISSIONS
    }
  ];
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
      const permissionsJson = JSON.stringify(payload.permissions || DEFAULT_TENANT_PERMISSIONS);
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
            wa_phone = COALESCE($11, wa_phone),
            permissions = COALESCE($12::jsonb, permissions)
          WHERE id = $13
          RETURNING *;
        `;
        const res = await client.query(query, [
          payload.name, payload.ai_primary_model, payload.ai_fallback_model,
          aiModelsJson,
          payload.feature_individual_parsing, payload.feature_bulk_summary,
          payload.pop3_host, payload.pop3_port, payload.pop3_user, payload.pop3_pass, payload.wa_phone,
          permissionsJson,
          payload.id
        ]);
        tenantRow = res.rows[0];
      } else {
        const query = `
          INSERT INTO public.tenants (name, ai_primary_model, ai_fallback_model, ai_models, feature_individual_parsing, feature_bulk_summary, pop3_host, pop3_port, pop3_user, pop3_pass, wa_phone, permissions)
          VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
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
          payload.wa_phone || '',
          permissionsJson
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
        let permissions: TenantPermissions = DEFAULT_TENANT_PERMISSIONS;
        if (user.tenant_id) {
          const tenant = await dbGetTenantById(user.tenant_id);
          if (tenant) {
            tenant_name = tenant.name;
            if (tenant.permissions) permissions = tenant.permissions;
          }
        }
        return {
          id: user.id,
          tenant_id: user.tenant_id || null,
          email: user.email,
          password_hash: user.password_hash,
          role: user.role,
          created_at: user.created_at,
          tenant_name,
          permissions
        };
      }
    } catch (err) {
      console.error('[dbManager] Failed to get user by email from MongoDB:', err);
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      const query = `
        SELECT u.*, t.name as tenant_name, t.permissions as tenant_permissions
        FROM public.users u
        LEFT JOIN public.tenants t ON u.tenant_id = t.id
        WHERE u.email = $1;
      `;
      const res = await dbService.pgPool.query(query, [email]);
      if (res.rows.length > 0) {
        const row = res.rows[0];
        let permissions: TenantPermissions = DEFAULT_TENANT_PERMISSIONS;
        if (row.tenant_permissions) {
          permissions = typeof row.tenant_permissions === 'string'
            ? JSON.parse(row.tenant_permissions)
            : row.tenant_permissions;
        }
        return {
          id: row.id,
          tenant_id: row.tenant_id || null,
          email: row.email,
          password_hash: row.password_hash,
          role: row.role,
          created_at: row.created_at,
          tenant_name: row.role === 'SUPER_ADMIN' ? 'SUPER ADMIN' : (row.tenant_name || 'Division'),
          permissions: row.role === 'SUPER_ADMIN' ? DEFAULT_TENANT_PERMISSIONS : permissions
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

// In-memory fallback store for daily summaries
const inMemoryDailySummaries: DailySummary[] = [];

/**
 * Save / Get Daily Summaries
 */
export async function dbSaveDailySummary(summary: DailySummary): Promise<DailySummary> {
  const dbService = await getDbService();
  const sourceIds = summary.source_email_ids || [];
  let savedSummary: DailySummary = {
    ...summary,
    id: Date.now(),
    created_at: new Date().toISOString()
  };

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('daily_summaries');
      const now = new Date();
      const res = await col.insertOne({
        ...summary,
        source_email_ids: sourceIds,
        created_at: now
      });
      savedSummary = {
        id: res.insertedId as any,
        ...summary,
        created_at: now.toISOString()
      };
      console.log(`[dbManager] Saved Daily Summary in MongoDB for Tenant ID: ${summary.tenant_id}`);
    } catch (err) {
      console.error('[dbManager] Failed to save Daily Summary in MongoDB:', err);
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      const query = `
        INSERT INTO public.daily_summaries (tenant_id, summary_date, content_text, is_sent_to_wa, source_email_ids)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
      `;
      const res = await dbService.pgPool.query(query, [
        summary.tenant_id,
        summary.summary_date,
        summary.content_text,
        !!summary.is_sent_to_wa,
        JSON.stringify(sourceIds)
      ]);
      if (res.rows.length > 0) {
        const row = res.rows[0];
        savedSummary = {
          id: row.id,
          tenant_id: row.tenant_id,
          summary_date: row.summary_date,
          content_text: row.content_text,
          is_sent_to_wa: !!row.is_sent_to_wa,
          source_email_ids: sourceIds,
          created_at: row.created_at
        };
      }
      console.log(`[dbManager] Saved Daily Summary in PostgreSQL for Tenant ID: ${summary.tenant_id}`);
    } catch (err) {
      console.error('[dbManager] Failed to save Daily Summary in PostgreSQL:', err);
    }
  }

  // Keep in memory fallback store
  inMemoryDailySummaries.unshift(savedSummary);
  return savedSummary;
}

function formatYYYYMMDD(val: any): string {
  if (!val) return '';
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const str = String(val).trim();
  if (str.includes('T')) return str.split('T')[0];
  if (str.includes(' ')) return str.split(' ')[0];
  return str;
}

/**
 * Get Daily Summaries for Tenant (populated with source_emails metadata)
 */
export async function dbGetDailySummaries(tenantId?: number): Promise<DailySummary[]> {
  const dbService = await getDbService();
  let rawSummaries: any[] = [];

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('daily_summaries');
      const query = tenantId ? { tenant_id: Number(tenantId) } : {};
      const res = await col.find(query).sort({ created_at: -1 }).toArray();
      rawSummaries = res.map((r: any) => ({
        id: r._id,
        tenant_id: r.tenant_id,
        summary_date: formatYYYYMMDD(r.summary_date),
        content_text: r.content_text,
        is_sent_to_wa: !!r.is_sent_to_wa,
        source_email_ids: Array.isArray(r.source_email_ids) ? r.source_email_ids : [],
        created_at: r.created_at
      }));
    } catch (err) {
      console.error('[dbManager] Failed to get Daily Summaries from MongoDB:', err);
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      const query = tenantId
        ? 'SELECT * FROM public.daily_summaries WHERE tenant_id = $1 ORDER BY created_at DESC'
        : 'SELECT * FROM public.daily_summaries ORDER BY created_at DESC';
      const values = tenantId ? [tenantId] : [];
      const res = await dbService.pgPool.query(query, values);
      rawSummaries = res.rows.map((row: any) => {
        let sourceIds: string[] = [];
        if (Array.isArray(row.source_email_ids)) {
          sourceIds = row.source_email_ids;
        } else if (typeof row.source_email_ids === 'string') {
          try { sourceIds = JSON.parse(row.source_email_ids); } catch { sourceIds = []; }
        }
        return {
          id: row.id,
          tenant_id: row.tenant_id,
          summary_date: formatYYYYMMDD(row.summary_date),
          content_text: row.content_text,
          is_sent_to_wa: !!row.is_sent_to_wa,
          source_email_ids: sourceIds,
          created_at: row.created_at
        };
      });
    } catch (err) {
      console.error('[dbManager] Failed to get Daily Summaries from PostgreSQL:', err);
    }
  }

  // Fallback / merge inMemoryDailySummaries
  const memFiltered = tenantId ? inMemoryDailySummaries.filter(s => s.tenant_id === Number(tenantId)) : inMemoryDailySummaries;
  for (const m of memFiltered) {
    if (!rawSummaries.some(r => r.id === m.id)) {
      rawSummaries.push(m);
    }
  }

  // Populate source_emails for each summary
  try {
    const { dbGetAllEmails } = await import('../database-service');
    for (const summary of rawSummaries) {
      const allTenantEmails = await dbGetAllEmails(summary.tenant_id);
      let matchedEmails: any[] = [];
      if (summary.source_email_ids && summary.source_email_ids.length > 0) {
        matchedEmails = allTenantEmails.filter(e => 
          summary.source_email_ids.includes(e.message_id) || summary.source_email_ids.includes(String(e.id))
        );
      }
      
      // Strict fallback: filter by summary_date if source_email_ids didn't yield matches
      if (matchedEmails.length === 0 && summary.summary_date) {
        matchedEmails = allTenantEmails.filter(e => {
          const emailDateStr = e.date ? new Date(e.date).toISOString().split('T')[0] : ((e as any).received_at ? new Date((e as any).received_at).toISOString().split('T')[0] : '');
          return emailDateStr === summary.summary_date;
        });
      }

      summary.source_emails = matchedEmails;
    }
  } catch (popErr) {
    console.error('[dbManager] Error populating source emails:', popErr);
  }

  return rawSummaries;
}

export async function dbGetDailySummaryById(id: number): Promise<DailySummary | null> {
  const dbService = await getDbService();
  let summary: DailySummary | null = null;

  if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('daily_summaries');
      const r = await col.findOne({ _id: id as any });
      if (r) {
        summary = {
          id: r._id as any,
          tenant_id: r.tenant_id,
          summary_date: r.summary_date,
          content_text: r.content_text,
          is_sent_to_wa: !!r.is_sent_to_wa,
          source_email_ids: Array.isArray(r.source_email_ids) ? r.source_email_ids : [],
          created_at: r.created_at
        };
      }
    } catch (err) {
      console.error('[dbManager] Error finding summary in MongoDB:', err);
    }
  } else if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      const res = await dbService.pgPool.query('SELECT * FROM public.daily_summaries WHERE id = $1', [id]);
      if (res.rows.length > 0) {
        const row = res.rows[0];
        let sourceIds: string[] = [];
        if (Array.isArray(row.source_email_ids)) {
          sourceIds = row.source_email_ids;
        } else if (typeof row.source_email_ids === 'string') {
          try { sourceIds = JSON.parse(row.source_email_ids); } catch { sourceIds = []; }
        }
        summary = {
          id: row.id,
          tenant_id: row.tenant_id,
          summary_date: row.summary_date,
          content_text: row.content_text,
          is_sent_to_wa: !!row.is_sent_to_wa,
          source_email_ids: sourceIds,
          created_at: row.created_at
        };
      }
    } catch (err) {
      console.error('[dbManager] Error finding summary in PostgreSQL:', err);
    }
  }

  if (summary) {
    try {
      const { dbGetAllEmails } = await import('../database-service');
      const allTenantEmails = await dbGetAllEmails(summary.tenant_id);
      if (summary.source_email_ids && summary.source_email_ids.length > 0) {
        summary.source_emails = allTenantEmails.filter(e => 
          summary.source_email_ids!.includes(e.message_id) || summary.source_email_ids!.includes(String(e.id))
        );
      } else {
        summary.source_emails = allTenantEmails.filter(e => e.is_summarized || !e.is_read || e.is_important).slice(0, 10);
      }
    } catch (err) {
      console.error('[dbManager] Error fetching source emails for summary detail:', err);
    }
  }

  return summary;
}

export async function dbUpdateDailySummaryWaStatus(id: number, isSent: boolean): Promise<void> {
  const dbService = await getDbService();
  if (dbService.type === 'postgres' && dbService.pgPool) {
    await dbService.pgPool.query('UPDATE public.daily_summaries SET is_sent_to_wa = $1 WHERE id = $2', [isSent, id]);
  } else if (dbService.type === 'mongodb' && dbService.mongoDb) {
    const col = dbService.mongoDb.collection('daily_summaries');
    await col.updateOne({ _id: id as any }, { $set: { is_sent_to_wa: isSent } });
  }
}

/**
 * Mail Config Management Functions (Multi-Account Support)
 */
export async function dbGetMailConfigs(tenantId?: number): Promise<MailConfig[]> {
  const dbService = await getDbService();
  let configs: MailConfig[] = [];

  if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      const query = tenantId 
        ? 'SELECT * FROM public.mail_configs WHERE tenant_id = $1 ORDER BY id ASC' 
        : 'SELECT * FROM public.mail_configs ORDER BY id ASC';
      const values = tenantId ? [tenantId] : [];
      const res = await dbService.pgPool.query(query, values);
      configs = res.rows.map((r: any) => ({
        id: r.id,
        tenant_id: r.tenant_id,
        email_address: r.email_address,
        host: r.host,
        port: r.port,
        username: r.username,
        password: r.password,
        is_active: r.is_active !== false,
        created_at: r.created_at
      }));
    } catch (err) {
      console.error('[dbManager] Error fetching mail_configs from PostgreSQL:', err);
    }
  } else if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('mail_configs');
      const query = tenantId ? { tenant_id: Number(tenantId) } : {};
      const res = await col.find(query).toArray();
      configs = res.map((r: any) => ({
        id: r._id as any,
        tenant_id: r.tenant_id,
        email_address: r.email_address,
        host: r.host,
        port: r.port,
        username: r.username,
        password: r.password,
        is_active: r.is_active !== false,
        created_at: r.created_at
      }));
    } catch (err) {
      console.error('[dbManager] Error fetching mail_configs from MongoDB:', err);
    }
  }

  // Auto-seed legacy tenant POP3 config if no mail_configs exist yet
  if (configs.length === 0 && tenantId) {
    try {
      const tenant = await dbGetTenantById(tenantId);
      if (tenant && tenant.pop3_user && tenant.pop3_host) {
        const legacyConfig: MailConfig = {
          tenant_id: tenant.id,
          email_address: tenant.pop3_user,
          host: tenant.pop3_host,
          port: tenant.pop3_port || 995,
          username: tenant.pop3_user,
          password: tenant.pop3_pass || '',
          is_active: true
        };
        const saved = await dbSaveMailConfig(legacyConfig);
        configs.push(saved);
      }
    } catch (seedErr) {
      console.error('[dbManager] Error auto-seeding legacy tenant mail config:', seedErr);
    }
  }

  return configs;
}

export async function dbSaveMailConfig(config: MailConfig): Promise<MailConfig> {
  const dbService = await getDbService();
  if (dbService.type === 'postgres' && dbService.pgPool) {
    const res = await dbService.pgPool.query(`
      INSERT INTO public.mail_configs (tenant_id, email_address, host, port, username, password, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *;
    `, [
      config.tenant_id,
      config.email_address,
      config.host,
      config.port || 995,
      config.username,
      config.password,
      config.is_active !== false
    ]);
    const row = res.rows[0];
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      email_address: row.email_address,
      host: row.host,
      port: row.port,
      username: row.username,
      password: row.password,
      is_active: row.is_active !== false,
      created_at: row.created_at
    };
  } else if (dbService.type === 'mongodb' && dbService.mongoDb) {
    const col = dbService.mongoDb.collection('mail_configs');
    const result = await col.insertOne({
      ...config,
      is_active: config.is_active !== false,
      created_at: new Date()
    });
    return {
      ...config,
      id: result.insertedId as any
    };
  }
  return config;
}

export async function dbUpdateMailConfig(id: number, config: Partial<MailConfig>): Promise<void> {
  const dbService = await getDbService();
  if (dbService.type === 'postgres' && dbService.pgPool) {
    await dbService.pgPool.query(`
      UPDATE public.mail_configs
      SET email_address = COALESCE($1, email_address),
          host = COALESCE($2, host),
          port = COALESCE($3, port),
          username = COALESCE($4, username),
          password = COALESCE($5, password),
          is_active = COALESCE($6, is_active)
      WHERE id = $7
    `, [
      config.email_address,
      config.host,
      config.port,
      config.username,
      config.password,
      config.is_active,
      id
    ]);
  } else if (dbService.type === 'mongodb' && dbService.mongoDb) {
    const col = dbService.mongoDb.collection('mail_configs');
    await col.updateOne({ _id: id as any }, { $set: config });
  }
}

export async function dbDeleteMailConfig(id: number): Promise<void> {
  const dbService = await getDbService();
  if (dbService.type === 'postgres' && dbService.pgPool) {
    await dbService.pgPool.query('DELETE FROM public.mail_configs WHERE id = $1', [id]);
  } else if (dbService.type === 'mongodb' && dbService.mongoDb) {
    const col = dbService.mongoDb.collection('mail_configs');
    await col.deleteOne({ _id: id as any });
  }
}

/**
 * DYNAMIC FILTERS MANAGEMENT (Super Admin Master Data)
 */
export async function dbGetDynamicFilters(tenantId?: number): Promise<DynamicFilterRule[]> {
  const dbService = await getDbService();
  let filters: DynamicFilterRule[] = [];

  if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      const query = tenantId 
        ? 'SELECT * FROM public.dynamic_filters WHERE tenant_id = $1 OR tenant_id IS NULL ORDER BY region ASC, branch ASC'
        : 'SELECT * FROM public.dynamic_filters ORDER BY region ASC, branch ASC';
      const values = tenantId ? [tenantId] : [];
      const res = await dbService.pgPool.query(query, values);
      filters = res.rows.map((r: any) => ({
        id: r.id,
        tenant_id: r.tenant_id,
        emails: r.emails,
        region: r.region,
        branch: r.branch,
        created_at: r.created_at
      }));
    } catch (err) {
      console.error('[dbManager] Error fetching dynamic_filters from PostgreSQL:', err);
    }
  } else if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('dynamic_filters');
      const query = tenantId ? { $or: [{ tenant_id: Number(tenantId) }, { tenant_id: null }] } : {};
      const res = await col.find(query).sort({ region: 1, branch: 1 }).toArray();
      filters = res.map((r: any) => ({
        id: r._id as any,
        tenant_id: r.tenant_id,
        emails: r.emails,
        region: r.region,
        branch: r.branch,
        created_at: r.created_at
      }));
    } catch (err) {
      console.error('[dbManager] Error fetching dynamic_filters from MongoDB:', err);
    }
  }

  return filters;
}

export async function dbSeedDynamicFilters(tenantId?: number): Promise<void> {
  const dbService = await getDbService();
  console.log('[dbManager] Seeding Dynamic Filters master data for Regions 1-6...');

  if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      for (const item of SEED_DYNAMIC_FILTERS_DATA) {
        await dbService.pgPool.query(`
          INSERT INTO public.dynamic_filters (tenant_id, emails, region, branch)
          VALUES ($1, $2, $3, $4)
        `, [tenantId || 1, item.emails, item.region, item.branch]);
      }
      console.log(`[dbManager] Successfully seeded ${SEED_DYNAMIC_FILTERS_DATA.length} Dynamic Filters in PostgreSQL`);
    } catch (err) {
      console.error('[dbManager] Error seeding Dynamic Filters in PostgreSQL:', err);
    }
  } else if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('dynamic_filters');
      const docs = SEED_DYNAMIC_FILTERS_DATA.map(item => ({
        tenant_id: tenantId || 1,
        emails: item.emails,
        region: item.region,
        branch: item.branch,
        created_at: new Date()
      }));
      await col.insertMany(docs);
      console.log(`[dbManager] Successfully seeded ${SEED_DYNAMIC_FILTERS_DATA.length} Dynamic Filters in MongoDB`);
    } catch (err) {
      console.error('[dbManager] Error seeding Dynamic Filters in MongoDB:', err);
    }
  }
}

export async function dbSaveDynamicFilter(rule: DynamicFilterRule, tenantId?: number): Promise<void> {
  const dbService = await getDbService();
  const targetTenantId = rule.tenant_id || tenantId || 1;

  if (dbService.type === 'postgres' && dbService.pgPool) {
    if (rule.id) {
      await dbService.pgPool.query(`
        UPDATE public.dynamic_filters
        SET emails = $1, region = $2, branch = $3
        WHERE id = $4 AND (tenant_id = $5 OR tenant_id IS NULL)
      `, [rule.emails, rule.region, rule.branch, rule.id, targetTenantId]);
    } else {
      await dbService.pgPool.query(`
        INSERT INTO public.dynamic_filters (tenant_id, emails, region, branch)
        VALUES ($1, $2, $3, $4)
      `, [targetTenantId, rule.emails, rule.region, rule.branch]);
    }
  } else if (dbService.type === 'mongodb' && dbService.mongoDb) {
    const col = dbService.mongoDb.collection('dynamic_filters');
    if (rule.id) {
      await col.updateOne({ _id: rule.id as any }, { $set: { emails: rule.emails, region: rule.region, branch: rule.branch } });
    } else {
      await col.insertOne({ ...rule, tenant_id: targetTenantId, created_at: new Date() });
    }
  }
}

export async function dbDeleteDynamicFilter(id: number, tenantId?: number): Promise<void> {
  const dbService = await getDbService();
  const targetTenantId = tenantId || 1;

  if (dbService.type === 'postgres' && dbService.pgPool) {
    await dbService.pgPool.query('DELETE FROM public.dynamic_filters WHERE id = $1 AND (tenant_id = $2 OR tenant_id IS NULL)', [id, targetTenantId]);
  } else if (dbService.type === 'mongodb' && dbService.mongoDb) {
    const col = dbService.mongoDb.collection('dynamic_filters');
    await col.deleteOne({ _id: id as any, tenant_id: targetTenantId });
  }
}

/**
 * Fetch pending emails with essential full payload fields (message_id, tenant_id, subject, body, sender, received_at)
 */
export async function dbGetPendingEmails(tenantId?: number): Promise<any[]> {
  const dbService = await getDbService();
  if (dbService.type === 'postgres' && dbService.pgPool) {
    try {
      let query = `SELECT message_id, tenant_id, subject, COALESCE(body_text, html_body, '') as body, sender, date, created_at FROM emails WHERE (ai_status = 'PENDING' OR is_summarized = false OR summary IS NULL OR summary = '' OR summary = 'Belum dianalisis (Menunggu AI...)')`;
      const params: any[] = [];
      if (tenantId) {
        query += ` AND (tenant_id = $1 OR tenant_id IS NULL)`;
        params.push(tenantId);
      }
      query += ` ORDER BY date DESC`;
      const res = await dbService.pgPool.query(query, params);
      return res.rows.map(r => ({
        message_id: r.message_id,
        tenant_id: r.tenant_id || tenantId || 1,
        subject: r.subject || '',
        body: r.body || '',
        body_text: r.body || '',
        sender: r.sender || '',
        received_at: r.date || r.created_at || new Date().toISOString()
      }));
    } catch (err) {
      console.error('[dbManager] Error fetching pending emails from PostgreSQL:', err);
    }
  } else if (dbService.type === 'mongodb' && dbService.mongoDb) {
    try {
      const col = dbService.mongoDb.collection('emails');
      const filter: any = { $or: [{ ai_status: 'PENDING' }, { is_summarized: false }, { summary: { $exists: false } }] };
      if (tenantId) filter.tenant_id = tenantId;
      const rows = await col.find(filter).sort({ date: -1 }).toArray();
      return rows.map(r => ({
        message_id: r.message_id,
        tenant_id: r.tenant_id || tenantId || 1,
        subject: r.subject || '',
        body: r.body_text || r.body || r.html_body || '',
        body_text: r.body_text || r.body || r.html_body || '',
        sender: r.sender || '',
        received_at: r.date || r.created_at || new Date().toISOString()
      }));
    } catch (err) {
      console.error('[dbManager] Error fetching pending emails from MongoDB:', err);
    }
  }
  return [];
}

