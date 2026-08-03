# SaaS Multi-Tenant Email AI Automation

**SaaS Multi-Tenant Email AI Automation** adalah platform otomatisasi email berbasis AI yang dirancang untuk mengelola, mengklasifikasikan (auto-tagging/folder virtual), memproses pesanan tunai (CIT Order Dispatch), dan merangkum email harian secara otomatis bagi berbagai tenant dan akun email organisasi.

---

## 🛠️ Tech Stack

- **Backend Runtime:** Node.js (TypeScript / Express v4)
- **Database Layer:** PostgreSQL (Drizzle ORM / Native SQL) & SQLite (Dual Driver support with Mongo/Relational Abstraction)
- **Background Queue & Workers:** BullMQ & Redis (Delayed jobs, Retry Mechanism, Concurrency)
- **AI Core Engine:** Google Gemini AI SDK (`@google/genai`) for email classification, CIT order extraction, and daily bulk summarization
- **Frontend Framework:** React 18 + Vite + Tailwind CSS + Lucide Icons
- **Real-Time Streaming:** Server-Sent Events (SSE) `/api/backfill-stream`

---

## 📋 Prerequisites & Local Setup

### 1. Prerequisites
- **Node.js**: v18.x or higher
- **Redis Server**: v6.x or higher (for BullMQ queues)
- **PostgreSQL**: v14.x or higher (or default SQLite local storage)

### 2. Installation
```bash
# Clone repository
git clone <repository-url>
cd email-ai-automation

# Install dependencies
npm install
```

### 3. Environment Variables Setup (`.env`)
Salin file `.env.example` ke `.env` dan konfigurasikan Kunci API serta kredensial Database:
```env
PORT=3000
NODE_ENV=development

# Gemini AI API Key
GEMINI_API_KEY=your_gemini_api_key_here

# Redis Configuration (BullMQ Queue)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=

# Database Driver Configuration ('postgres' or 'sqlite')
DB_DRIVER=sqlite
DATABASE_URL=postgres://user:password@localhost:5432/email_automation_db
```

---

## 🗄️ Database Initialization

1. Bukalah **pgAdmin**, **DBeaver**, atau terminal PostgreSQL.
2. Eksekusi skrip DDL dari file `database/schema.sql`:
   ```bash
   psql -U postgres -d email_automation_db -f database/schema.sql
   ```
3. Memasukkan Data Master Dynamic Filters (Aturan Klasifikasi Folder):
   ```sql
   INSERT INTO custom_filters (tenant_id, name, match_from, action_parent, action_child)
   VALUES 
   (1, 'Routing Region 1', 'palembang@company.com, bengkulu@company.com', 'REGION 1', 'PALEMBANG'),
   (1, 'Routing Region 2', 'bandung@company.com', 'REGION 2', 'BANDUNG');
   ```

---

## 🏗️ Application Architecture & Detailed Flow

### High-Level Architecture
```
+------------------+     POP3/IMAP      +----------------------+
|  Email Server    | -----------------> | POP3 Cron Fetcher    |
+------------------+                    +----------------------+
                                                  |
                                                  v
                                        +----------------------+
                                        | Custom Filter Sweep  | (Auto-Folder Tagging)
                                        +----------------------+
                                        | Status: PENDING      |
                                        +----------------------+
                                                  |
                                                  v
                                        +----------------------+
                                        | BullMQ Redis Queue   |
                                        +----------------------+
                                                  |
                                                  v
                                        +----------------------+
                                        | AI Processing Worker | (Gemini AI Engine)
                                        +----------------------+
                                                  |
                                                  v
                                        +----------------------+
                                        | Relational DB        |
                                        +----------------------+
                                                  |
                                                  v
                                        +----------------------+
                                        | React Dashboard UI   | (SSE Realtime Updates)
                                        +----------------------+
```

### Detailed Low-Level System Flow & Logic Execution

#### 1. POP3 Fetcher Multi-Account (`src/cron.ts`)
- **Penjadwalan (Cron Scheduler)**: Berjalan setiap interval tertentu untuk mengecek pesan baru dari server mail.
- **Iterasi Akun Active (`mail_configs`)**: Mengambil seluruh konfigurasi server email aktif yang terdaftar berdasarkan `tenant_id`.
- **Ekstraksi Body & Parsing Raw Header**: Membaca raw header, sender, subject, serta body teks/HTML.
- **Pattern Matching Auto-Tagging (`custom_filters`)**: 
  - Membandingkan `sender_email`, `subject`, dan `body` terhadap aturan di tabel `custom_filters`.
  - Jika `sender_email` cocok dengan string comma-separated di `match_from`, folder langsung ditentukan ke `action_parent` & `action_child` (misal: `REGION 1 > PALEMBANG`).
- **Penyimpanan Status PENDING**: Menyimpan email ke tabel `emails` dengan `status = 'PENDING'`.
- **Enqueue Job ke BullMQ**: Menambahkan job baru ke antrean Redis `email-ai-queue` untuk diproses secara asinkron oleh AI Engine.

#### 2. AI Worker Engine (`src/services/aiWorker.ts` & `src/services/aiProcessingService.ts`)
- **Queue Consumer**: Worker mendengarkan job dari BullMQ queue.
- **Klasifikasi Tingkat Urgensi & Ringkasan**: Mengirimkan isi email ke Google Gemini AI untuk mengekstrak:
  - Urgensi: `HIGH`, `MEDIUM`, `LOW`.
  - Flag Tindakan: `action_required` (true/false).
  - Ringkasan Eksekutif Bahasa Indonesia.
- **Ekstraksi CIT Order (Bank Order Dispatch)**:
  - Deteksi pesan pemesanan pengiriman uang tunai / pengisian ATM.
  - Regex & AI extraction jumlah lembar pecahan uang (`target_tickets`, denominasi 100k, 50k, dsb).
- **Update Database State**: Mengubah status email dari `PENDING` menjadi `PROCESSED`.

#### 3. Retroactive Tagging / Backfill Sweeper (`src/database-service.ts`)
- **Fungsi `dbBackfillFolders()`**: Mengambil email lama yang ada di database.
- **Evaluasi Ulang Filter**: Membandingkan email lama dengan seluruh aturan `custom_filters` terbaru.
- **Update Massal**: Memperbarui kolom `folder_parent` dan `folder_child` secara instan serta memicu refresh Virtual Folder Tree pada UI Sidebar.

#### 4. Multi-Tenant & Multi-Account Isolation
- **Role-Based Access Control (RBAC)**:
  - `SUPER_ADMIN`: Memiliki akses penuh ke Global Analytics, Tenant Management, dan seluruh tenant folder.
  - `TENANT_USER`: Akses terisolasi terbatas pada `tenant_id` penggunanya sendiri.
- **Multi-Account Filtering**: Memungkinkan filter tampilan email berdasarkan alamat `source_email` individual atau agregat seluruh akun.

---

## 📜 Available NPM Scripts

- `npm run dev`: Menjalankan server Express backend dan Vite dev server secara bersamaan pada port 3000.
- `npm run build`: Kompilasi frontend Vite dan bundel backend TypeScript (`esbuild`) ke `dist/server.cjs`.
- `npm run start`: Menjalankan aplikasi hasil build produksi (`node dist/server.cjs`).
- `npm run backfill-emails`: Menjalankan CLI script/worker backfill untuk memproses ulang tagging email historis.
- `npm run lint`: Menjalankan TypeScript type check (`tsc --noEmit`).
