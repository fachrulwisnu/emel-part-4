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

## 🏗️ Application Architecture & Detailed Flow (Full-Payload Redis Broker)

### 1. Diagram Alur Sistem (Mermaid JS)

```mermaid
graph TD
    subgraph Trigger [Pemicu System / Input]
        A1[Cron Job POP3 Fetcher]
        A2[UI Manual Trigger: Bulk / Individual]
    end

    subgraph Storage_Initial [Initial Storage]
        B1[(PostgreSQL / DB)\nRow Email Mentah Status: PENDING]
    end

    subgraph Broker [Message Broker Layer]
        C1[Redis Queue / BullMQ\naiQueue]
    end

    subgraph Processing [Background Worker Engine]
        D1[AI Worker\naiWorker.process]
        D2[AI Extraction Service\nanalyzeEmail / Gemini Model]
    end

    subgraph Storage_Final [Final Persistence]
        E1[(PostgreSQL / DB)\nUPDATE: summary, tag_type, ai_status = COMPLETED]
    end

    A1 -->|INSERT Email Mentah| B1
    A1 -->|Push Full Payload| C1
    A2 -->|Query Pending & Push Full Payload| C1
    
    C1 -->|Pop Job Payload| D1
    D1 -->|Parse & Validate JSON| D2
    D2 -->|Hasil Ringkasan & Tagging| D1
    D1 -->|UPDATE Email Fields| E1
```

### 2. Penjelasan Flow Arsitektur (Step-by-Step)

- **Langkah 1: Ingestion (Penarikan Data):**
  Email masuk melalui Cron Job POP3 (`fetchPop3Emails`) secara berkala atau dipanggil melalui aksi manual pengguna di UI ("Proses Semua" / Bulk Extraction). Pada tahap ini, email mentah disimpan terlebih dahulu (*INSERT*) ke database PostgreSQL dengan status `ai_status = 'PENDING'`.

- **Langkah 2: Queuing (Antrean Redis):**
  Sistem **tidak lagi memanggil AI secara langsung** secara sinkron untuk menghindari *timeout* dan *Database Race Condition*. Sistem membungkus seluruh data utuh (*Full Payload*: `message_id`, `tenant_id`, `subject`, `body`, `sender`, `received_at`) lalu mem-push-nya ke antrean Redis (`aiQueue.add(...)`). Endpoint API langsung mengembalikan respons HTTP 200 (*Fire and Forget*) tanpa menunggu eksekusi AI selesai.

- **Langkah 3: Asynchronous Processing (Worker):**
  Worker di latar belakang (`aiWorker.process`) mendengarkan (*listen*) antrean Redis. Ketika job masuk, worker mengambil *Full Payload* tersebut. Karena payload sudah berisi teks email lengkap, worker dapat langsung bekerja tanpa harus bergantung pada hasil baca (*SELECT*) ulang dari DB yang berisiko belum ter-commit.

- **Langkah 4: AI Extraction:**
  Fungsi `analyzeEmail` menerima payload utuh, menyusun prompt, dan mengirimkannya ke LLM Engine (Google Gemini / AI Model Provider). Setelah AI mengembalikan respons JSON, fungsi **wajib melakukan validasi ketat**: jika objek hasil AI kosong atau `summary` bernilai kosong/NULL, sistem akan melempar *Error* agar job dianggap *Failed* dan dapat di-retry oleh BullMQ, bukan *Silent Success*.

- **Langkah 5: DB Persistence:**
  Setelah eksekusi dan validasi AI berhasil, `dbManager.dbUpdateEmailFields` / `updateEmail` menjalankan query `UPDATE` ke row PostgreSQL berdasarkan `message_id`. Pendekatan ini menjamin tidak terjadi *Race Condition* karena *INSERT* data mentah pada Langkah 1 dipastikan sudah selesai di-commit sebelum *UPDATE* dipanggil.

---

### 3. Function Mapping (Kamus Kode Developer)

Tabel berikut memetakan fungsi-fungsi utama dalam basis kode untuk memudahkan proses *Hand-Over* (HO) developer baru:

| Nama Fungsi / Handler | File Lokasi | Deskripsi & Tugas Utama |
| :--- | :--- | :--- |
| `fetchPop3Emails()` | `src/cron.ts` | Bertugas menarik email baru dari server POP3/IMAP, melakukan filtering awal, dan menyimpan (*INSERT*) email mentah ke DB. |
| `executeControlledBulkProcess()` / API Handler `POST /api/ai/bulk-extract` | `src/services/aiProcessingService.ts` & `server.ts` | Bertugas men-query seluruh email pending dari DB dan mem-push *Full Payload* ke antrean Redis (`aiQueue`), lalu langsung mereturn HTTP 200 (*Fire and Forget*). |
| `POST /api/ai/resummary-tenant` | `server.ts` | Endpoint khusus Re-Summary Tenant: Mereset kolom AI (`summary = NULL`, `urgency_level = NULL`, `denomination_breakdown = '{}'::jsonb`) untuk tenant & receiver terkait, lalu mem-push ulang email ke Redis Queue. |
| `aiQueue.add(...)` | `src/config/queue.ts` | Bertugas memasukkan paket job data (*Full Payload*) ke dalam Redis Queue berbasis BullMQ. Melakukan `await aiQueue.obliterate({ force: true })` saat startup untuk clean start. |
| `aiWorker.process(...)` | `src/workers/aiWorker.ts` | *Listener* latar belakang yang mengambil job dari Redis BullMQ secara asinkron untuk diproses oleh worker. |
| `analyzeEmail(emailPayload)` | `src/database-service.ts` | Jantung ekstraksi AI. Menerima payload utuh, mengekstrak JSON `denomination_breakdown` & total nominal (`BIGINT`), memanggil LLM Provider, serta memvalidasi respons JSON. |
| `generateDailySummary(tenantId)` | `src/services/aiProcessingService.ts` | Menghasilkan rangkuman harian divisi dengan Fallback Max Date jika tidak ada email pada `CURRENT_DATE`. |
| `dbManager.updateEmail(...)` / `dbUpdateEmailFields` | `src/services/dbManager.ts` | Bertugas menyimpan (*UPDATE*) hasil ekstraksi JSON dari AI (`summary`, `urgency_level`, `receiver`, `date`, `denomination_breakdown`) kembali ke PostgreSQL secara presisi. |

---

## 🗺️ Database Column Schema Mapping (Exact PostgreSQL Match)

Aplikasi telah disesuaikan 100% secara mutlak dengan skema tabel `emails` PostgreSQL:

- `summary`: Menyimpan teks hasil ringkasan email AI (bukan `summary_text`).
- `urgency_level`: Menyimpan tingkat urgensi email (`High`, `Medium`, `Routine`, dsb. Bukan `urgent_level`).
- `receiver`: Menyimpan email penerima (bukan `receiver_email`).
- `"date"`: Tanggal dan waktu email diterima (menggunakan tanda kutip ganda `"date"` karena reserved word PostgreSQL).
- `denomination_breakdown`: JSONB (`DEFAULT '{}'::jsonb`) untuk menyimpan rincian pecahan uang (Key-Value Pair murni, contoh: `{"50000": 350000000, "100000": 100000000}`).

---

## 📜 Available NPM Scripts

- `npm run dev`: Menjalankan server Express backend dan Vite dev server secara bersamaan pada port 3000.
- `npm run build`: Kompilasi frontend Vite dan bundel backend TypeScript (`esbuild`) ke `dist/server.cjs`.
- `npm run start`: Menjalankan aplikasi hasil build produksi (`node dist/server.cjs`).
- `npm run backfill-emails`: Menjalankan CLI script/worker backfill untuk memproses ulang tagging email historis.
- `npm run lint`: Menjalankan TypeScript type check (`tsc --noEmit`).
