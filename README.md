# 🏢 Enterprise Multi-Tenant SaaS Email AI Automation Platform

[![Node.js Version](https://img.shields.io/badge/Backend-Node.js%20%2B%20TypeScript-green?style=for-the-badge&logo=nodedotjs)](https://nodejs.org/)
[![React Version](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![Database](https://img.shields.io/badge/Database-PostgreSQL%20%2B%20SQLite-darkblue?style=for-the-badge&logo=postgresql)](https://www.postgresql.org/)
[![Message Queue](https://img.shields.io/badge/Queue-Redis%20%2B%20BullMQ-red?style=for-the-badge&logo=redis)](https://redis.io/)
[![LLM Routing](https://img.shields.io/badge/AI%20Engine-Multi--LLM%20Rotator-orange?style=for-the-badge&logo=nvidia)](https://www.nvidia.com/)

Platform SaaS Enterprise B2B multi-tenant yang mengotomatisasi pemrosesan email masuk operasional perusahaan secara end-to-end menggunakan **Artificial Intelligence**, **Redis Message Queue (BullMQ)**, dan **Multi-Model LLM Routing**. 

Sistem secara cerdas membaca, mengklasifikasikan, mengekstraksi data operasional penting (seperti tiket order Cash-In-Transit / ATM), dan merangkum email prioritas tinggi serta mengirimkan laporan berkala melalui WhatsApp Gateway.

---

## 📌 1. What & Why (Tujuan Utama Platform)

Dalam dunia industri perbankan, logistik, dan layanan keuangan (*CIT/Cash in Transit*), ribuan email masuk setiap hari berisi instruksi operasional, permintaan pengisian uang ATM, laporan cabang, dan komunikasi divisi. 

**Enterprise Multi-Tenant SaaS Email AI Automation Platform** hadir untuk memecahkan hambatan operasional tersebut dengan:
1. **Menghilangkan Input Data Manual**: Mengekstraksi data nominal, mata uang, nama cabang, dan detail order CIT/ATM dari email secara presisi dalam hitungan detik.
2. **Mencegah AI Timeout / Bottleneck**: Menggunakan arsitektur Message Queue berbasis Redis & BullMQ untuk pemrosesan asinkron yang stabil dan tahan terhadap rate limit LLM.
3. **Mengotomatisasi Pelaporan**: Menghasilkan *Daily Bulk Summary* untuk divisi manajemen (RH/BM) dan mengirimkannya secara otomatis via WhatsApp Web Gateway.

---

## 🔐 2. Ekosistem Multi-Tenant & Role-Based Access Control (RBAC)

Sistem mengadopsi arsitektur multi-tenant terisolasi untuk memisahkan data, hak akses, dan konfigurasi antar divisi atau anak perusahaan.

```
+-----------------------------------------------------------------------------------+
|                                  SUPER ADMIN                                      |
|  - Alokasi Multi-LLM Model per Tenant    - Global Analytics & Performance Logs    |
|  - Manajemen Pendaftaran Tenant/Divisi   - Database Switcher & Global System Config |
+-----------------------------------------------------------------------------------+
                                          |
                   +----------------------+----------------------+
                   |                                             |
                   v                                             v
+-------------------------------------+       +-------------------------------------+
|         TENANT ADMIN: COS           |       |       TENANT ADMIN: RH / BM         |
|  - Single-Tenant Isolated Inbox     |       |  - Single-Tenant Isolated Inbox     |
|  - Individual AI Ticket Parsing     |       |  - Daily Bulk Summary Engine        |
|  - CIT / ATM Dispatch Control       |       |  - Automated WhatsApp Blast Report |
|  - Dedicated Mail & WA POP3 Config  |       |  - Dedicated Mail & WA POP3 Config  |
+-------------------------------------+       +-------------------------------------+
```

### Roles & Responsibilities:
* 👑 **Super Admin**:
  * Mengelola pendaftaran tenant/divisi baru dan alokasi role pengguna.
  * Memilih dan membatasi alokasi model AI (Multi-Select AI Routing) untuk setiap tenant guna efisiensi token.
  * Mengakses Global System Dashboard, analytics performa, serta Dynamic Database Switcher.
* 🏢 **Tenant Admin (Contoh: Divisi COS, RH, BM)**:
  * Login ke dashboard terisolasi sesuai divisi masing-masing.
  * Mengonfigurasi Server Mail POP3 dan sesi WhatsApp Gateway khusus divisi mereka.
  * Mengatur *Dynamic Filters* (kata kunci filter email operasional).
  * Meninjau hasil analisis AI, tiket CIT/ATM, serta eksekusi *Daily Bulk Summaries*.

---

## 🛠️ 3. Arsitektur Teknologi (Tech Stack)

* **Backend Engine**: Node.js murni dengan Express & TypeScript (Arsitektur CJS/ESM terkompilasi via `esbuild`).
* **Relational Database**: PostgreSQL (menggunakan ekstensi `pgcrypto` untuk secure password hashing & UUID generation) dan SQLite3 sebagai local fallback driver.
* **Message Broker & Queue**: **Redis** (Memurai di lingkungan Windows) + **BullMQ** untuk pengelolaan job antrean pemrosesan AI secara asinkron.
* **External Gateways**:
  * **Mail Fetcher**: Protocol POP3/IMAP asinkron dengan enkripsi TLS/SSL.
  * **WhatsApp Dispatcher**: WhatsApp Web Client Session untuk laporan terintegrasi.
* **Frontend UI**: React 18, Vite, Tailwind CSS, Lucide Icons, dan Framer Motion.

---

## 🤖 4. LLM Routing & Utilization (Manajemen Multi-Model AI)

Sistem dilengkapi **Multi-Model LLM Engine** yang terintegrasi dengan Google Gemini API dan NVIDIA NIM Ecosystem:

```
+-----------------------------------------------------------------------------------+
|                             MULTI-MODEL LLM ENGINE                                |
+-----------------------------------------------------------------------------------+
|  1. Custom AI Core (Nemotron-3-Super 120B)   4. Nemotron 3 Super                    |
|  2. Custom AI Vision (Cosmos3-Nano Reasoner) 5. Qwen3 Next 80B                      |
|  3. Nemotron 3 Nano Omni                    6. StepFun AI 3.7 Flash                 |
+-----------------------------------------------------------------------------------+
```

### Fitur Alokasi Model per Tenant:
* Super Admin dapat mencentang model AI mana saja yang diizinkan untuk digunakan oleh tenant tertentu.
* **Cost & Speed Optimization**: Tenant dengan beban kerja teks sederhana hanya diberikan model ringan (misal *Nemotron 3 Nano*), sedangkan tenant bernilai tinggi diberikan akses ke *Nemotron 3 Super* atau *Vision Engine*.
* **Automatic Failover & Retry**: Jika terjadi rate limit (HTTP 429) atau timeout pada provider AI, BullMQ Worker akan melakukan *exponential backoff retry* (3x percobaan dengan interval bertahap).

---

## 🔄 5. Alur Kerja End-to-End (Execution Workflows)

### 📩 Workflow 1: Individual AI Parsing (Divisi COS - Order Tiket CIT/ATM)

```
[Server POP3 Cron]
       │ (Tarik email baru setiap interval)
       ▼
[Database PostgreSQL] ────► Simpan Email Asli (ai_status = 'PENDING')
       │
       ▼
[Redis BullMQ Queue]  ────► Enqueue Job { email_id, tenant_id }
       │
       ▼
[BullMQ Worker (aiWorker)] ◄── Background Process
       │
       ├─► Fetch Email & Tenant AI Config
       ├─► Kirim Payload ke Selected LLM Engine
       ├─► Ekstraksi Data Tiket (Bank, Mata Uang, Nominal, Denominasi)
       │
       ▼
[Database PostgreSQL] ────► Update Email (ai_status = 'COMPLETED', simpan JSON analisis)
```

1. **Cron POP3 Fetcher** secara berkala menarik email masuk dari server email.
2. Email disimpan ke database PostgreSQL dengan status awal `ai_status = 'PENDING'`.
3. Cron menambahkan payload `{ email_id, tenant_id }` ke antrean **Redis BullMQ** (`email-ai-queue`) dan langsung menyelesaikan tugasnya (*non-blocking*).
4. **BullMQ Worker (`aiWorker.ts`)** di background mengambil antrean, mengeksekusi ekstraksi LLM, lalu memperbarui data email di DB menjadi `ai_status = 'COMPLETED'`.

---

### 📊 Workflow 2: Daily Bulk Summary & WhatsApp Blast (Divisi RH / BM)

```
[Cron Harian / Manual Trigger]
       │
       ▼
[Fetch Unread Emails] ────► Kumpulkan seluruh email masuk milik Tenant (RH/BM)
       │
       ▼
[Mega-Prompt LLM Engine] ──► Kirim seluruh batch email ke AI untuk ringkasan eksekutif
       │
       ▼
[Database & WA Gateway] ───► Simpan rangkuman harian & Blast laporan ke WhatsApp Divisi
```

1. Cron harian atau pemicu manual mengambil seluruh email masuk yang belum dibaca milik tenant tertentu.
2. Email digabungkan menjadi satu *mega-prompt* raksasa yang dikirim ke LLM Engine untuk menemukan prioritas utama dan isu penting.
3. Hasil rangkuman eksekutif disimpan ke database dan secara otomatis dikirimkan (*blast*) ke grup WhatsApp divisi melalui WhatsApp Gateway.

---

## 📁 6. Struktur Sistem & Folder (Project Structure)

```
├── config/                        # File konfigurasi global
│   └── database-config.json       # Konfigurasi koneksi active driver DB
├── src/
│   ├── config/
│   │   ├── dbSwitcher.ts          # Logic dynamic database switching
│   │   └── queue.ts               # Inisialisasi Redis & BullMQ Queue
│   ├── workers/
│   │   └── aiWorker.ts            # Consumer Worker BullMQ & Queue Monitor
│   ├── services/
│   │   ├── aiProcessingService.ts # Service komunikasi LLM (Gemini & NVIDIA NIM)
│   │   └── dbManager.ts           # Service pengelola tenant, user, RBAC, DB queries
│   ├── components/                # Komponen antarmuka React UI (Tailwind CSS)
│   │   ├── SuperAdminAnalyticsView.tsx
│   │   ├── SuperAdminTenantsView.tsx
│   │   ├── BulkSummaryView.tsx
│   │   └── TenantIntegrationSettings.tsx
│   ├── cit-api-service.ts         # Handlers integrasi order CIT/ATM
│   ├── cron.ts                    # Task scheduler POP3 fetcher & Bulk Summaries
│   ├── database-service.ts        # Abstraksi PostgreSQL & SQLite queries
│   ├── pop3.ts                    # Service konektor email POP3
│   └── App.tsx                    # Komponen utama React UI & State Store
├── server.ts                      # Entrypoint Express Server (API & Static Server)
├── package.json                   # Manifest dependensi proyek
└── README.md                      # Dokumentasi teknis proyek
```

---

## 🚀 7. Cara Instalasi & Menjalankan Lokal (Getting Started)

### Prasyarat Sistem
* **Node.js**: v18.0.0 atau versi terbaru.
* **PostgreSQL**: Terinstal lokal atau cloud (buat database bernama `emails_db`).
* **Redis Server**: Redis v6+ terinstal dan berjalan di `localhost:6379` (Gunakan **Memurai** jika di Windows).

### Langkah-Langkah Instalasi

1. **Clone Repositori & Install Dependensi**:
   ```bash
   git clone <repository-url>
   cd enterprise-email-ai-platform
   npm install
   ```

2. **Jalankan Redis Server**:
   Pastikan layanan Redis / Memurai sudah aktif di port `6379`:
   ```bash
   # Linux / macOS
   redis-server

   # Windows (Memurai / WSL Redis)
   memurai.exe
   ```

3. **Konfigurasi Environment Variables (`.env`)**:
   Buat file `.env` di root direktori:
   ```env
   PORT=3000
   NODE_ENV=development

   # PostgreSQL Configuration
   POSTGRES_URI=postgresql://postgres:postgres@localhost:5432/emails_db

   # Redis Configuration
   REDIS_HOST=localhost
   REDIS_PORT=6379

   # AI Provider API Keys
   GEMINI_API_KEY="AIzaSy..."
   NVIDIA_API_KEY="nvapi-..."
   ```

4. **Inisialisasi Database PostgreSQL**:
   Jalankan query SQL awal untuk membuat tabel `emails`, `tenants`, `users`, `custom_filters`, dan `email_analysis`:
   ```bash
   npm run seed
   ```

5. **Jalankan Aplikasi dalam Mode Pengembangan**:
   ```bash
   npm run dev
   ```
   Aplikasi dan BullMQ Queue Worker akan aktif di [http://localhost:3000](http://localhost:3000).

6. **Monitor Terminal Output**:
   Di terminal Anda akan melihat log monitor antrean Redis secara real-time setiap 15 detik:
   ```text
   [Worker Service] Initializing Email AI Worker...
   [Redis Queue Monitor] 🔄 Pending: 0 | ⚡ Active: 0 | ✅ Completed: 12 | ❌ Failed: 0
   ```

---

## 🛡️ License & Maintenance

Dikembangkan untuk kebutuhan otomatisasi operasional tingkat Enterprise B2B. Bebas dari hambatan rate limit dengan arsitektur Redis Queue & Multi-Tenant Isolation yang aman.
