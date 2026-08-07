# SaaS Multi-Tenant Email AI Automation

**SaaS Multi-Tenant Email AI Automation** adalah platform otomatisasi email berbasis AI yang dirancang untuk mengelola, mengklasifikasikan (auto-tagging/folder virtual), memproses pesanan tunai (CIT Order Dispatch), dan merangkum email harian secara otomatis bagi berbagai tenant dan akun email organisasi.

---

## 🛠️ Tech Stack

- **Backend Runtime:** Node.js (TypeScript / Express v4)
- **Database Layer:** PostgreSQL (Drizzle ORM / Native SQL) & SQLite (Dual Driver support with Mongo/Relational Abstraction)
- **Background Queue & Workers:** RabbitMQ (`amqplib`) - Decoupled Task Queue (Retry Mechanism, Concurrency, Durable Queues)
- **System Log Storage:** PostgreSQL (`system_logs` table) - Tenant-isolated system logs
- **AI Core Engine:** Google Gemini AI SDK (`@google/genai`) for email classification, CIT order extraction, and daily bulk summarization
- **Frontend Framework:** React 18 + Vite + Tailwind CSS + Lucide Icons
- **Real-Time Streaming:** Server-Sent Events (SSE) `/api/backfill-stream`

---

## 📋 Prerequisites & Local Setup (Cara Run di Local)

### 1. Prerequisites
- **Node.js**: v18.x atau lebih tinggi
- **RabbitMQ Server**: v3.x atau lebih tinggi (dapat dijalankan via Docker atau Service Lokal)
- **PostgreSQL**: v14.x atau lebih tinggi (atau SQLite bawaan untuk lokal)

### 2. Menjalankan Service Pendukung (RabbitMQ & PostgreSQL) via Docker (Rekomendasi)
Jika Anda menggunakan Docker, Anda dapat menjalankan RabbitMQ dan PostgreSQL dengan perintah berikut:

```bash
# Jalankan RabbitMQ dengan Management Dashboard (Port 5672 & 15672)
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management

# Jalankan PostgreSQL (Port 5432)
docker run -d --name postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=email_automation_db -p 5432:5432 postgres:15
```

> **Catatan UI Dashboard RabbitMQ:** Setelah dijalankan, Anda dapat mengakses dashboard manajemen RabbitMQ di `http://localhost:15672` (Username default: `guest`, Password: `guest`).

### 3. Skrip DDL Database (PostgreSQL)
Jalankan query DDL berikut di database PostgreSQL Anda untuk membuat tabel `system_logs` (pencatat log aktivitas per tenant):

```sql
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    tenant_id INT NOT NULL,
    task_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'SUCCESS', 'FAILED', 'PROCESSING', 'INFO'
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index untuk mempercepat query filtering per tenant oleh Superadmin
CREATE INDEX IF NOT EXISTS idx_system_logs_tenant_id ON system_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at DESC);
```

### 4. Instalasi & Environment Variables Setup (`.env`)
1. Clone repository & install dependencies:
```bash
git clone <repository-url>
cd email-ai-automation
npm install
```

2. Buat file `.env` di root project dan sesuaikan konfigurasi berikut:
```env
PORT=3000
NODE_ENV=development

# Google Gemini AI API Key
GEMINI_API_KEY=your_gemini_api_key_here

# RabbitMQ Configuration (AMQP Broker)
RABBITMQ_URL=amqp://localhost:5672

# Database Driver Configuration ('postgres' or 'sqlite')
DB_DRIVER=postgres
DATABASE_URL=postgres://postgres:postgres@localhost:5432/email_automation_db
```

### 5. Menjalankan Aplikasi di Local
Untuk menjalankan aplikasi dalam mode development (Server Express + Worker RabbitMQ + Frontend Vite secara bersamaan di port 3000):

```bash
npm run dev
```

Buka browser dan akses aplikasi di: `http://localhost:3000`

---

## 🏗️ Application Architecture & Detailed Flow (RabbitMQ Message Broker)

### 1. Diagram Alur Sistem (Mermaid JS)

```mermaid
graph TD
    subgraph Trigger [Pemicu System / Input]
        A1[Cron Job POP3 Fetcher]
        A2[UI Manual Trigger: Bulk / Individual / Sync]
    end

    subgraph Storage_Initial [Initial Storage]
        B1[(PostgreSQL / DB)\nRow Email Mentah Status: PENDING]
    end

    subgraph Broker [Message Broker Layer]
        C1[RabbitMQ Broker / amqplib\nemail_tasks_queue]
    end

    subgraph Processing [Background Worker Engine]
        D1[RabbitMQ Worker\nsrc/workers/aiWorker.ts]
        D2[AI Extraction Service\nanalyzeEmail / Gemini Model]
    end

    subgraph Storage_Final [Final Persistence]
        E1[(PostgreSQL / DB)\nUPDATE: summary, tag_type, ai_status = COMPLETED]
        E2[(PostgreSQL / DB)\nINSERT INTO system_logs]
    end

    A1 -->|INSERT Email Mentah| B1
    A1 -->|Publish Payload JSON| C1
    A2 -->|Query Pending & Publish Payload| C1
    
    C1 -->|Consume Message| D1
    D1 -->|Parse & Process Asynchronously| D2
    D2 -->|Hasil Ringkasan & Tagging| D1
    D1 -->|UPDATE Email Fields| E1
    D1 -->|Catat Progress & Error Log| E2
```

### 2. Penjelasan Flow Arsitektur (Step-by-Step)

- **Langkah 1: Ingestion (Penarikan Data):**
  Email masuk melalui Cron Job POP3 (`fetchPop3Emails`) secara berkala atau dipanggil melalui aksi manual pengguna di UI. Data email mentah disimpan (*INSERT*) ke database PostgreSQL.

- **Langkah 2: Queuing (Antrean RabbitMQ):**
  Sistem membungkus payload JSON berisi `tenantId`, `taskType` (`SYNC_MAIL` | `AI_PARSE` | `BULK_SUMMARY`), dan `payload` data. Payload dipublish ke queue RabbitMQ (`email_tasks_queue`). Endpoint API langsung mengembalikan respons sukses instan `{ success: true, message: "Task successfully queued to RabbitMQ" }` (*Fire and Forget*) tanpa risiko timeout.

- **Langkah 3: Asynchronous Processing (Worker Consumer):**
  Worker di latar belakang (`src/workers/aiWorker.ts`) yang berjalan terus-menerus mendengarkan antrean RabbitMQ mengambil pesan dari queue secara asinkron.

- **Langkah 4: AI Extraction & Real-time Logging:**
  Worker memproses tugas sesuai `taskType` (misalnya ekstraksi AI menggunakan Google Gemini). Seluruh progres, status (`PROCESSING`, `SUCCESS`, `FAILED`), dan pesan error dicatat secara real-time langsung ke tabel PostgreSQL `system_logs`.

- **Langkah 5: Acknowledgment & DB Persistence:**
  Setelah eksekusi berhasil, worker memanggil `channel.ack(msg)` dan mengupdate kolom data email di PostgreSQL. Jika terjadi kesalahan fatal, worker memanggil `channel.nack(msg, false, false)` dan meng-update status error di database.

---

### 3. Function Mapping (Kamus Kode Developer)

| Nama Fungsi / Handler | File Lokasi | Deskripsi & Tugas Utama |
| :--- | :--- | :--- |
| `publishTask(tenantId, taskType, payload)` | `src/config/rabbitmq.ts` | Bertugas mempublish payload tugas JSON ke RabbitMQ broker `email_tasks_queue` dan mencatat log pendaftaran ke `system_logs`. |
| `startRabbitWorker()` | `src/workers/aiWorker.ts` | Consumer/Worker utama yang mendengarkan queue RabbitMQ, mengeksekusi tugas asinkron, dan memberikan `ack`/`nack`. |
| `getSystemLogsForTenant(tenantId)` | `src/config/rabbitmq.ts` | Mengambil 100 log aktivitas sistem terbaru untuk tenant tertentu dari tabel PostgreSQL `system_logs`. |
| `analyzeEmail(emailPayload)` | `src/database-service.ts` | Jantung ekstraksi AI. Menerima payload email, mengekstrak pecahan uang (CIT), memanggil LLM Gemini, dan memvalidasi respons. |
| `generateDailySummary(tenantId, date)` | `src/services/aiProcessingService.ts` | Menghasilkan rangkuman harian divisi untuk tenant tertentu. |
| `dbManager.updateEmail(...)` / `dbUpdateEmailFields` | `src/services/dbManager.ts` | Menyimpan (*UPDATE*) hasil ringkasan AI kembali ke PostgreSQL. |

---

## 📜 Available NPM Scripts

- `npm run dev`: Menjalankan server Express backend, RabbitMQ worker, dan Vite dev server secara bersamaan pada port 3000.
- `npm run build`: Kompilasi frontend Vite dan bundel backend TypeScript (`esbuild`) ke `dist/server.cjs`.
- `npm run start`: Menjalankan aplikasi hasil build produksi (`node dist/server.cjs`).
- `npm run lint`: Menjalankan TypeScript type check (`tsc --noEmit`).

