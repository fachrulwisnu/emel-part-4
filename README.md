# 🤖 AI Operational Assistant Copilot (CIT & ATM Ticketing System)

[![React Version](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![Node.js Version](https://img.shields.io/badge/Backend-Node.js%20Express-green?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![Database Cloud](https://img.shields.io/badge/Database-Supabase%20%2B%20SQLite-darkgreen?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![LLM Models](https://img.shields.io/badge/AI%20Core-NVIDIA%20NIM-orange?style=for-the-badge&logo=nvidia)](https://www.nvidia.com/)

Sistem automasi ticketing berbasis email tingkat lanjut yang dirancang khusus untuk memproses pesanan **Cash In Transit (CIT)** dan pengisian uang tunai **ATM** secara cerdas, asinkron, dan real-time menggunakan arsitektur AI hibrida berkinerja tinggi serta ketahanan tingkat tinggi terhadap pembatasan rate limit API.

---

## 📌 1. Project Overview (Ikhtisar Proyek)

**AI Operational Assistant Copilot** mengautomasi alur kerja manual pengolahan email operasional bernilai tinggi. Sistem secara otomatis menguping, membaca, dan menganalisis email masuk yang berisi instruksi rumit, mengekstraksi parameter operasional penting seperti **Bank Tujuan**, **Mata Uang**, **Total Nominal**, serta **Pecahan/Denominasi**, lalu mempresentasikannya ke dalam antarmuka dashboard operasional yang interaktif dan dinamis.

Dengan integrasi cerdas ini, tim operasional dapat memangkas waktu entri data manual dari beberapa menit menjadi dalam hitungan detik secara aman, presisi tinggi, dan bebas hambatan API.

---

## 🤖 2. Arsitektur AI & Mekanisme Pengendalian Rate-Limit

Sistem ini didesain tangguh (*resilient*) menggunakan **Split-Task Parallel AI Architecture** yang berfokus pada kecepatan respon, ketahanan terhadap kegagalan API, pemadaman jaringan, maupun kuota rate limit ketat (NVIDIA NIM 40 RPM).

### ⚡ Split-Task Parallel AI Execution
Kini, alur analisis email berjalan secara **asinkron-paralel sesungguhnya** menggunakan `Promise.allSettled()`. Ketika sebuah email masuk ke sistem:
1. **Task 1 (Summary & Tagging)**: Diproses asinkron menggunakan fungsi `generateSummaryAndTagging` untuk mengekstrak ringkasan operasional mendalam, level urgensi, mata uang, nominal transaksi, rekomendasi bank tujuan, hingga folder penempatan utama dalam Bahasa Indonesia.
2. **Task 2 (Attachment Intelligence)**: Jika email memiliki berkas lampiran, tugas analisis mendalam `processEmailIntelligence` dipicu secara paralel. AI akan membedah isi dokumen/gambar lampiran secara ephemeral, mengekstrak ringkasan lampiran, serta merumuskan folder taktis operasional.
3. **Parallel Settlement & Merge**: Kedua proses asinkron ini berjalan secara konkuren. Hasil keluaran masing-masing model digabungkan secara cerdas oleh mesin integrator, lalu disimpan dalam satu kali transaksi tulis ke database untuk memangkas waktu latensi pemrosesan hingga 50%.

### Alur Pemrosesan AI & Mekanisme Throttling
```
                    +------------------------------------+
                    |       Email Masuk Terdeteksi       |
                    +------------------------------------+
                                      |
                                      v
                    +------------------------------------+
                    |     Analisis Asinkron Dipicu       |
                    +------------------------------------+
                                      |
                +----------------------+----------------------+
                |                                             |
                v (Pemrosesan Paralel Konkuren)               v
   +------------------------------------------+  +------------------------------------------+
   |    TASK 1: SUMMARY & TAGGING CORE        |  |    TASK 2: ATTACHMENT INTELLIGENCE CORE  |
   |    Model: Nemotron 3 Ultra / DeepSeek    |  |    Model: Inkling / Gemma / Minimax      |
   |    Engine: Axios / OpenAI SDK             |  |    Engine: Ephemeral File Streamer       |
   |    Tugas: Klasifikasi, Nominal, Folder    |  |    Tugas: Multimodal & OCR Dokumen       |
   +------------------------------------------+  +------------------------------------------+
                |                                             |
                +----------------------+----------------------+
                                      | (Parallel Settlement: Promise.allSettled)
                                      v
                       +-------------------------------+
                       |  Mekanisme Sanitasi Array DB  |
                       |  Deteksi & Perbaikan Otomatis |
                       +-------------------------------+
                                      |
                                      v
                        +-----------------------------+
                        | Sukses? -> Simpan ke DB     |
                        +-----------------------------+
                                      |
                                      | (Jika Core Gagal / Limit 429)
                                      v
                        +-----------------------------+
                        | EXPONENTIAL BACKOFF ACTIVE  |
                        | Deteksi 429 -> Delay 30s    |
                        +-----------------------------+
                                      |
                                      | (Jika Tetap Gagal)
                                      v
                        +-----------------------------+
                        | FALLBACK CASCADING TIER     |
                        | Nemotron -> DeepSeek ->     |
                        | Gemma -> Minimax -> Regex   |
                        +-----------------------------+
```

### 🛡️ Robust DB Array Sanitizer & Parser
Untuk menjamin kompatibilitas tanpa celah antara SQLite lokal (yang menyimpan metadata lampiran sebagai string JSON) dan Supabase PostgreSQL (yang mewajibkan tipe data array asli atau format literal terstruktur), sistem ini dilengkapi dengan **Dynamic Array Sanitizer**:
- Mencegah error fatal Postgres `Malformed array literal` dengan melakukan normalisasi tipe data secara defensif sebelum data dikirim ke database cloud.
- Secara cerdas memotong, merapikan karakter kurung kurawal `{}` / siku `[]`, memisahkan koma, serta membungkus string kosong agar transaksi tulis database selalu berjalan dengan status sukses (100% database-safe).

### ⏳ Real-Time SSE Bulk Sync Engine
Pengguna kini dapat memantau pengerjaan antrean email pending secara transparan melalui **Server-Sent Events (SSE) Streaming API** (`/api/emails/bulk-summary/stream` dan `/api/emails/bulk-intelligence/stream`):
- **Dynamic Queue Counter & Status**: Dasbor secara berkala memantau antrean email pending dan menampilkan badge jumlah waktu nyata (*real-time pending counter*).
- **Streaming Output Logs**: Konsol log beralur maju (*live-scrolling terminal logs*) langsung memproyeksikan status batch, waktu jeda, dan respons model AI ke monitor pengguna.
- **Micro-batching Throttling**: Memproses email secara berkelompok (maksimal **5 email per batch**) dengan jeda tunggu otomatis **15 detik** di setiap siklus batch selesai untuk memulihkan batas kuota (Rate Limit) NVIDIA NIM API secara elegan tanpa mengganggu antrean utama.

### 🔮 Alur Analisis Ephemeral Attachment & Streaming File
Sistem memproses lampiran email tanpa membebani penyimpanan lokal maupun cloud melalui pemrosesan ephemeral serta menyajikannya kembali secara aman dan real-time:

```
                     +------------------------------------+
                     |    User Memilih Tiket Email        |
                     +------------------------------------+
                                       |
                                       v
                     +------------------------------------+
                     | Klik Tombol "Analyze Intelligence" |
                     +------------------------------------+
                                       |
                                       v
                     +------------------------------------+
                     |  Sistem Mengambil Base64 Lampiran  |
                     |  dari SQLite / Supabase DB         |
                     +------------------------------------+
                                       |
                                       v
                     +------------------------------------+
                     |  Mengubah ke Format Ephemeral File |
                     |  (Tanpa Disimpan di Storage Cloud) |
                     +------------------------------------+
                                       |
                     +-----------------+-----------------+
                     |                                   |
                     v                                   v
       +----------------------------+      +----------------------------+
       |   Ekstraksi Teks (PDF/Doc) |      |   Analisis Visual Lampiran |
       |   oleh Core AI Parsing     |      |   oleh Multimodal Core AI  |
       +----------------------------+      +----------------------------+
                     |                                   |
                     +-----------------+-----------------+
                                       |
                                       v
                     +------------------------------------+
                     |   Menggabungkan Ringkasan Berkas   |
                     |   menjadi Deskripsi Operasional     |
                     +------------------------------------+
                                       |
                                       v
                     +------------------------------------+
                     |   Menyimpan Metadata Analisis ke   |
                     |   Tabel `email_analysis` (SQLite)  |
                     +------------------------------------+
                                       |
                     +-----------------+-----------------+
                     v (Bila User Meminta File Asli)     v (Bila User Membaca Summary)
       +----------------------------+      +----------------------------+
       | Klik "Download" Attachment |      | Teks Deskripsi Langsung    |
       +----------------------------+      | Ditampilkan di Dashboard   |
                     |                     +----------------------------+
                     v
       +----------------------------+
       | Stream Real-time dari DB   |
       | via Endpoint API `/api/...`|
       +----------------------------+
                     |
                     v
       +----------------------------+
       | File Terunduh Aman & Cepat |
       +----------------------------+
```

---

## ✨ 3. Fitur Unggulan Terbaru

* **🔮 Dasbor Intelijen Email AI (AI Email Intelligence Dashboard)**:
  * Antarmuka visual terpisah yang diakses via menu **Sparkles Icon** untuk analisis mendalam tanpa mengotori ruang kerja inbox harian.
  * **Tree Navigation Folder Accordion**: Mengelompokkan seluruh email secara otomatis dan hierarkis ke dalam folder induk (*Folder Parent* seperti nama bank/kategori) dan folder anak (*Folder Child* seperti sub-kategori operasional) lengkap dengan indikator jumlah (badge counter) di tiap tingkatan folder.
  * **Ephemeral Attachment Analysis**: Model kecerdasan buatan NVIDIA / Gemini memproses file lampiran secara asinkron dan menghasilkan deskripsi teks ringkas tanpa harus menyimpan file biner di penyimpanan cloud permanen, meminimalkan biaya penyimpanan (*storage bloat*) dan risiko kebocoran data.
  * **Real-time Secure File Streaming Engine**: Menyediakan endpoint `/api/emails/:message_id/attachment/:filename` untuk mengekstrak data lampiran Base64 secara instan langsung dari database SQLite/Supabase dan mengalirkannya kembali (*stream*) ke peramban pengguna lengkap dengan metadata header biner (`Content-Type`, `Content-Disposition`, `Content-Length`) sehingga file dapat diunduh secara real-time dan aman.
* **💵 Pecahan & Denominasi Dynamic (IDR/USD)**:
  * Antarmuka entri pecahan kini berubah secara dinamis berdasarkan state mata uang (`mataUang`) aktif yang dipilih.
  * Opsi pecahan diperbarui secara dinamis:
    * **USD**: `[USD 1, USD 2, USD 5, USD 10, USD 20, USD 50, USD 100]`
    * **IDR**: `[IDR 1000, IDR 2000, IDR 5000, IDR 10000, IDR 20000, IDR 50000, IDR 100000]`
  * Seluruh perhitungan subtotal, fungsi `handleDenominationChange`, dan visualisasi selisih (`totalHitung`) didesain adaptif terhadap simbol mata uang aktif (bebas dari hardcode label "IDR/Rp").
* **🤖 Smart Split-Task JSON Extraction**: Memilah tugas pemrosesan email yang rumit menjadi sub-tugas paralel ke beberapa model AI terbaik di kelasnya untuk menghasilkan data terstruktur dengan format JSON yang sangat akurat.
* **🟢 Sistem AI Health Check & Diagnostics**: Endpoint `/api/settings/ai-health` mendiagnosis kesehatan masing-masing model AI secara real-time. Jika terjadi kegagalan, timeout, atau status 503 (Server Penuh/Sibuk), sistem memberikan respons informatif yang mendetail pada dasbor.
* **📧 UI Dasbor Tiket Interaktif (Gmail-Style)**: Desain antarmuka modern yang nyaman dipandang. Menampilkan indikator status model AI yang memproses (misalnya Nemotron/Inkling, DeepSeek, Gemma, Minimax) secara dinamis.
* **💬 WhatsApp Dispatch Dispatcher**: Notifikasi otomatis siap kirim ke pihak ketiga dan pengawal melalui WhatsApp Gateway dengan template yang telah disesuaikan dengan nilai pecahan dari denominasi dinamis.
* **📎 Dukungan Base64 Attachments**: File lampiran dikodekan langsung menjadi Base64 string terkompresi (maksimal 3MB) dan disimpan di database, meniadakan ketergantungan pada penyimpanan cloud eksternal yang rawan kebocoran data.

---

## 🛠️ 4. Tech Stack (Spesifikasi Teknologi)

* **Frontend Framework**: React 18, Vite, Tailwind CSS, Lucide Icons, Framer Motion (Animasi Micro-interaction).
* **Backend Runtime**: Node.js Express Server, tsx (TypeScript Execution), esbuild (Ultra-fast bundler).
* **Databases**: Supabase PostgreSQL (Cloud State Sync) & SQLite 3 (Durable Local Storage Engine).
* **AI & Integration**: Axios murni & SDK `openai` yang dikombinasikan dengan NVIDIA NIM API endpoints.

---

## 🚀 5. Memulai (Getting Started)

### Prasyarat Sistem
* Node.js v18 atau versi yang lebih baru.
* Akun Supabase (opsional, sistem otomatis menggunakan SQLite lokal jika tidak dikonfigurasi).

### Langkah Instalasi

1. **Clone repositori dan masuk ke direktori proyek:**
   ```bash
   git clone <repository-url>
   cd ai-operational-copilot
   ```

2. **Instal seluruh dependensi yang diperlukan:**
   ```bash
   npm install
   ```

3. **Konfigurasi Environment Variables (`.env`):**
   Salin berkas `.env.example` menjadi `.env` di root direktori Anda:
   ```bash
   cp .env.example .env
   ```
   Isi parameter rahasia berikut di dalam file `.env`:
   ```env
   # API Key NVIDIA NIM (Wajib untuk Analisis Cerdas AI)
   NVIDIA_API_KEY=""
   NVIDIA_API_KEY_INKLING=""
   NVIDIA_API_KEY_MINIMAX=""
   NVIDIA_API_KEY_NEMOTRON=""
   NVIDIA_API_KEY_DEEPSEEK=""
   NVIDIA_API_KEY_GEMMA4=""
   ```

4. **Jalankan Aplikasi dalam Mode Pengembangan (Dev Mode):**
   ```bash
   npm run dev
   ```
   Aplikasi dan backend server akan berjalan secara paralel di alamat [http://localhost:3000](http://localhost:3000).

5. **Kompilasi Produksi (Production Build):**
   ```bash
   npm run build
   ```
   Server produksi dapat dijalankan langsung dengan:
   ```bash
   npm run start
   ```

---

## 🛡️ 6. Penanganan Kesalahan & Ketahanan Sistem

* **API Timeout Protection**: Seluruh permintaan eksternal AI dipasangi batas waktu (timeout) 60 detik menggunakan Axios untuk meminimalkan penumpukan proses hanging.
* **Server 503 Detection**: Jendela Health Check mendeteksi status server sibuk (HTTP 503) pada model AI secara akurat dan menampilkan label "Server Penuh/Sibuk (503)" daripada crash senyap.
* **Double-Write Fallback**: Jika koneksi Supabase terputus, data tetap aman tersimpan di SQLite lokal dan siap digunakan secara independen tanpa disrupsi.
