import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { Email, EmailAnalysis } from '../models/mongodb';

// Load environment variables
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

async function runMigration() {
  console.log('====================================================');
  console.log('🚀 MEMULAI PROSES MIGRASI DATA: SUPABASE -> MONGODB');
  console.log('====================================================\n');

  if (!MONGODB_URI) {
    console.error('❌ ERROR: MONGODB_URI tidak ditemukan di .env!');
    process.exit(1);
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('❌ ERROR: SUPABASE_URL atau SUPABASE_KEY tidak ditemukan di .env!');
    process.exit(1);
  }

  // 1. Hubungkan ke MongoDB Atlas
  try {
    console.log('🔌 Menghubungkan ke MongoDB Atlas...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB Atlas terhubung dengan sukses!\n');
  } catch (err: any) {
    console.error('❌ ERROR: Koneksi MongoDB gagal:', err.message || err);
    process.exit(1);
  }

  // 2. Inisialisasi Supabase Client
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const BATCH_SIZE = 50;

  // ==========================================
  // FASE 1: Migrasi Data public.emails
  // ==========================================
  try {
    console.log('--- FASE 1: Migrasi data dari tabel "emails" ---');
    
    // Ambil total count
    const { count, error: countError } = await supabase
      .from('emails')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      throw new Error(`Gagal mengambil jumlah baris dari emails: ${countError.message}`);
    }

    const totalEmails = count || 0;
    console.log(`📊 Ditemukan total ${totalEmails} data email di Supabase.`);

    let start = 0;
    let successCount = 0;
    let failureCount = 0;

    while (start < totalEmails) {
      const end = start + BATCH_SIZE - 1;
      console.log(`📥 Mengambil batch emails dari index ${start} sampai ${Math.min(end, totalEmails - 1)}...`);
      
      const { data: rows, error: fetchError } = await supabase
        .from('emails')
        .select('*')
        .order('message_id', { ascending: true })
        .range(start, end);

      if (fetchError) {
        console.error(`❌ Gagal mengambil batch ${start}-${end}:`, fetchError.message);
        start += BATCH_SIZE;
        continue;
      }

      if (!rows || rows.length === 0) {
        break;
      }

      // Persiapkan operasi bulkWrite
      const operations = rows.map((row: any) => {
        // Bersihkan tags dan attachments jika berupa string JSON
        let parsedTags = row.tags;
        if (typeof parsedTags === 'string') {
          try { parsedTags = JSON.parse(parsedTags); } catch (e) { parsedTags = [row.tags]; }
        }

        let parsedAttachments = row.attachments;
        if (typeof parsedAttachments === 'string') {
          try { parsedAttachments = JSON.parse(parsedAttachments); } catch (e) { parsedAttachments = []; }
        }

        return {
          updateOne: {
            filter: { message_id: row.message_id },
            update: {
              $set: {
                message_id: row.message_id,
                subject: row.subject,
                sender: row.sender,
                receiver: row.receiver,
                date: row.date,
                body_text: row.body_text,
                html_body: row.html_body,
                tags: Array.isArray(parsedTags) ? parsedTags : [],
                category: row.category,
                sub_category: row.sub_category,
                folder_parent: row.folder_parent,
                folder_child: row.folder_child,
                api_workflow_status: row.api_workflow_status,
                api_workflow_log: row.api_workflow_log,
                is_read: row.is_read === true || row.is_read === 1 || String(row.is_read) === 'true',
                tag_type: row.tag_type,
                summary: row.summary,
                action_required: row.action_required === true || row.action_required === 1 || String(row.action_required) === 'true',
                suggested_tag: row.suggested_tag,
                is_important: row.is_important === true || row.is_important === 1 || String(row.is_important) === 'true',
                urgency_level: row.urgency_level,
                suggested_folder_parent: row.suggested_folder_parent,
                suggested_folder_child: row.suggested_folder_child,
                is_cit_order: row.is_cit_order === true || row.is_cit_order === 1 || String(row.is_cit_order) === 'true',
                cit_type: row.cit_type,
                suggested_bank: row.suggested_bank,
                extracted_notes: row.extracted_notes,
                currency: row.currency,
                denomination_suggestion: row.denomination_suggestion,
                total_amount: row.total_amount,
                ai_status: row.ai_status,
                attachments: Array.isArray(parsedAttachments) ? parsedAttachments : []
              }
            },
            upsert: true
          }
        };
      });

      // Lakukan bulkWrite secara aman
      try {
        const result = await Email.bulkWrite(operations, { ordered: false });
        successCount += rows.length;
        console.log(`📈 Progress: Berhasil memigrasi ${successCount} dari ${totalEmails} data emails...`);
      } catch (bulkError: any) {
        console.warn(`⚠️ Peringatan: Ada error saat melakukan bulkWrite pada batch ini. Memproses secara individual untuk isolasi kesalahan...`);
        // Jika bulkWrite gagal, kita coba satu per satu agar script tidak terhenti
        for (const op of operations) {
          try {
            await Email.updateOne(op.updateOne.filter, op.updateOne.update, { upsert: true });
            successCount++;
          } catch (singleError: any) {
            console.error(`❌ Gagal migrasi email message_id [${op.updateOne.filter.message_id}]:`, singleError.message);
            failureCount++;
          }
        }
        console.log(`📈 Progress: Berhasil memigrasi ${successCount} dari ${totalEmails} data emails (dengan beberapa kesalahan)...`);
      }

      start += BATCH_SIZE;
    }

    console.log(`\n🎉 FASE 1 SELESAI: Berhasil memigrasi ${successCount} emails, ${failureCount} gagal.\n`);

  } catch (err: any) {
    console.error('❌ ERROR kritis pada FASE 1:', err.message || err);
  }

  // ==========================================
  // FASE 2: Migrasi Data public.email_analysis
  // ==========================================
  try {
    console.log('--- FASE 2: Migrasi data dari tabel "email_analysis" ---');

    // Ambil total count
    const { count, error: countError } = await supabase
      .from('email_analysis')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      throw new Error(`Gagal mengambil jumlah baris dari email_analysis: ${countError.message}`);
    }

    const totalAnalysis = count || 0;
    console.log(`📊 Ditemukan total ${totalAnalysis} data analisis email di Supabase.`);

    let start = 0;
    let successCount = 0;
    let failureCount = 0;

    while (start < totalAnalysis) {
      const end = start + BATCH_SIZE - 1;
      console.log(`📥 Mengambil batch email_analysis dari index ${start} sampai ${Math.min(end, totalAnalysis - 1)}...`);

      const { data: rows, error: fetchError } = await supabase
        .from('email_analysis')
        .select('*')
        .order('message_id', { ascending: true })
        .range(start, end);

      if (fetchError) {
        console.error(`❌ Gagal mengambil batch ${start}-${end}:`, fetchError.message);
        start += BATCH_SIZE;
        continue;
      }

      if (!rows || rows.length === 0) {
        break;
      }

      // Persiapkan operasi bulkWrite
      const operations = rows.map((row: any) => {
        let parsedTags = row.tags;
        if (typeof parsedTags === 'string') {
          try { parsedTags = JSON.parse(parsedTags); } catch (e) { parsedTags = [row.tags]; }
        }

        let parsedAttachments = row.summary_attachments || row.attachment_summary;
        if (typeof parsedAttachments === 'string') {
          try { parsedAttachments = JSON.parse(parsedAttachments); } catch (e) { parsedAttachments = []; }
        }

        return {
          updateOne: {
            filter: { message_id: row.message_id },
            update: {
              $set: {
                message_id: row.message_id,
                folder: row.folder,
                sub_folder: row.sub_folder,
                tags: Array.isArray(parsedTags) ? parsedTags : [],
                summary_email: row.summary_email,
                summary_attachments: parsedAttachments,
                attachment_summary: parsedAttachments, // provide both for compatibility
                created_at: row.created_at
              }
            },
            upsert: true
          }
        };
      });

      // Lakukan bulkWrite secara aman
      try {
        const result = await EmailAnalysis.bulkWrite(operations, { ordered: false });
        successCount += rows.length;
        console.log(`📈 Progress: Berhasil memigrasi ${successCount} dari ${totalAnalysis} data email_analysis...`);
      } catch (bulkError: any) {
        console.warn(`⚠️ Peringatan: Ada error saat melakukan bulkWrite pada batch ini. Memproses secara individual untuk isolasi kesalahan...`);
        for (const op of operations) {
          try {
            await EmailAnalysis.updateOne(op.updateOne.filter, op.updateOne.update, { upsert: true });
            successCount++;
          } catch (singleError: any) {
            console.error(`❌ Gagal migrasi email_analysis message_id [${op.updateOne.filter.message_id}]:`, singleError.message);
            failureCount++;
          }
        }
        console.log(`📈 Progress: Berhasil memigrasi ${successCount} dari ${totalAnalysis} data email_analysis (dengan beberapa kesalahan)...`);
      }

      start += BATCH_SIZE;
    }

    console.log(`\n🎉 FASE 2 SELESAI: Berhasil memigrasi ${successCount} email_analysis, ${failureCount} gagal.\n`);

  } catch (err: any) {
    console.error('❌ ERROR kritis pada FASE 2:', err.message || err);
  }

  // 3. Putuskan koneksi MongoDB
  try {
    console.log('🔌 Memutus koneksi MongoDB...');
    await mongoose.disconnect();
    console.log('✅ Koneksi MongoDB diputus dengan bersih.');
  } catch (err) {
    console.error('⚠️ Gagal memutuskan koneksi MongoDB dengan bersih:', err);
  }

  console.log('\n====================================================');
  console.log('✨ PROSES MIGRASI DATA SELESAI!');
  console.log('====================================================');
}

// Jalankan migrasi
runMigration();
