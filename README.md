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

## 🤖 2. Arsitektur AI Mekanik & Ultimate AI Rotator System

Sistem ini didesain tangguh (*resilient*) menggunakan arsitektur **Ultimate AI Rotator** berbasis kombinasi ekosistem Google Gemini dan NVIDIA NIM (Cosmos3, Qwen3, StepFun). Sistem berfokus pada kestabilan tinggi, ketahanan terhadap kegagalan API, pembatasan rate limit ketat, serta otomatisasi rotasi berantai jika salah satu model mengalami kegagalan.

### ⚡ Alur Pemrosesan AI & Mekanisme Throttling
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
               v (Pemrosesan Paralel Core)                   v
  +------------------------------------------+  +------------------------------------------+
  |    PRIMARY SUMMARY CORE                  |  |    PRIMARY CONTEXTUAL TAGGING            |
  |    Model: Nemotron-3-Super-120B          |  |    Model: Nemotron-3-Super-120B          |
  |    Engine: OpenAI SDK / NVIDIA NIM       |  |    Engine: OpenAI SDK / NVIDIA NIM       |
  |    Fitur: Split-Task Parallel AI         |  |    Fitur: Async Promise.allSettled()     |
  +------------------------------------------+  +------------------------------------------+
               |                                             |
               +----------------------+----------------------+
                                      | (Merge Output JSON)
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
                       | FALLBACK TIER               |
                       | Model: Gemini 3.5 Flash     |
                       | Engine: Google GenAI SDK    |
                       +-----------------------------+
                                      |
                                      | (Jika Gemini Gagal)
                                      v
                       +-----------------------------+
                       | SECONDARY FALLBACK          |
                       | Model: DeepSeek / Gemma     |
                       +-----------------------------+
                                      |
                                      | (Jika Semua AI Gagal)
                                      v
                       +-----------------------------+
                       | Regex / Rule-Based Fallback |
                       +-----------------------------+
```

### ⚡ Proteksi Throttling & Anti-Timeout NVIDIA NIM
Untuk mencegah kegagalan akibat batas 40 RPM (Requests Per Minute) pada NVIDIA NIM, sistem mengadopsi taktik berikut:
* **Dynamic Queue Batching**: Pemrosesan massal email (Bulk AI / Data Backfill / Queue Workers) dipangkas dari ukuran besar menjadi maksimal **2 email** saja per batch secara konkuren menggunakan `Promise.allSettled()`.
* **Strict Time Throttling**: Ditambahkan jeda waktu aman (**15 detik**) antar batch pemrosesan untuk memberikan waktu regenerasi rate limit NVIDIA NIM secara berkala.
* **Exponential Backoff**: Jaringan interseptor otomatis mendeteksi HTTP 429 Too Many Requests atau batas rate limit. Saat limit tercapai, sistem akan otomatis melakukan jeda tunggu aman selama **30 detik** sebelum mengulangi permintaan secara cerdas.
* **Live Terminal Logging**: Konsol log beralur maju (*live-scrolling terminal logs*) langsung memproyeksikan status batch, waktu jeda, dan respons model AI ke monitor pengguna pada modal terpadu secara real-time via Server-Sent Events (SSE).

---

## 🔮 3. Alur Analisis Ephemeral Attachment & Ultimate AI Rotator

Sistem memproses lampiran email tanpa membebani penyimpanan lokal maupun cloud melalui pemrosesan ephemeral serta menyajikannya kembali secara aman dan real-time menggunakan **Ultimate AI Rotator** yang membedakan alur berdasarkan tipe berkas:

### 🔄 Alur Rotator Cerdas:
1. **GAMBAR (.jpg, .png, .jpeg)**: Urutan rotasinya adalah **Cosmos3-Nano-Reasoner** ➡️ **Gemini 3.5 Flash** ➡️ **Qwen3-Next-80B** ➡️ **StepFun-3.7-Flash**.
2. **DOKUMEN/TEKS (.txt, .pdf, dsb)**: Urutan rotasinya adalah **Qwen3-Next-80B** ➡️ **StepFun-3.7-Flash** ➡️ **Gemini 3.5 Flash**.

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
                     |   Validasi Ukuran Lampiran         |
                     |   (Max 20MB, Skip jika melebihi)   |
                     +------------------------------------+
                                       |
                                       v
                     +------------------------------------+
                     |  Mengubah ke Format Ephemeral File |
                     +------------------------------------+
                                       |
                                       v
                     +------------------------------------+
                     |  Kompresi Otomatis via Sharp       |
                     |  (Jika Gambar, di-keep < 180KB)    |
                     +------------------------------------+
                                       |
                     +-----------------+-----------------+
                     |                                   |
                     v (Jika GAMBAR .jpg/.png)           v (Jika DOKUMEN/TEKS)
        +----------------------------+      +----------------------------+
        |   ROTATOR GAMBAR:          |      |   ROTATOR DOKUMEN:         |
        |   1. Cosmos3-Nano-Reasoner |      |   1. Qwen3-Next-80B        |
        |   2. Gemini 3.5 Flash      |      |   2. StepFun-3.7-Flash     |
        |   3. Qwen3-Next-80B        |      |   3. Gemini 3.5 Flash      |
        |   4. StepFun-3.7-Flash     |      +----------------------------+
        +----------------------------+                     |
                     |                                     |
                     +-----------------+-------------------+
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
                     |   Tabel `email_analysis` / DB      |
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

## ✨ 4. Fitur Unggulan Terbaru

* **🔮 Dasbor Intelijen Email AI (AI Email Intelligence Dashboard)**:
  * Antarmuka visual terpisah yang diakses via menu **Sparkles Icon** untuk analisis mendalam tanpa mengotori ruang kerja inbox harian.
  * **Tree Navigation Folder Accordion**: Mengelompokkan seluruh email secara otomatis dan hierarkis ke dalam folder induk (*Folder Parent* seperti nama bank/kategori) dan folder anak (*Folder Child* seperti sub-kategori operasional) lengkap dengan indikator jumlah (badge counter) di tiap tingkatan folder.
  * **AI Intelligence Queue Management Modal**: Dialog modal komprehensif yang menampilkan bar progres "Diproses: X dari Y Email" beserta persentasenya, daftar antrean pending, dan terminal log box hitam yang terhubung ke Server-Sent Events (SSE).
* **🟢 Sistem AI Health Check & Diagnostics**:
  * Widget monitor real-time yang diletakkan di pojok atas sistem header.
  * Menampilkan lampu indikator hijau (Aktif/Online) dan merah (Gangguan/Offline) untuk masing-masing model operasional utama: **Cosmos3-Nano-Reasoner**, **Gemini 3.5 Flash**, **Qwen3-Next-80B**, dan **StepFun-3.7-Flash**.
  * Dilengkapi info latency (Response Time) aktual dalam hitungan milidetik dan deskripsi error terperinci saat disentuh/diklik.
* **⚡ Kompresi & Validasi Ukuran File Otomatis**:
  * Menggunakan library `sharp` untuk melakukan resize dan reduksi kualitas gambar secara dinamis agar base64 payload berada di bawah batasan API 180KB.
  * Proteksi ukuran berkas masukan maksimal 20MB untuk mencegah crash kelebihan memori pada runtime Node.js.
* **💵 Pecahan & Denominasi Dynamic (IDR/USD)**:
  * Antarmuka entri pecahan kini berubah secara dinamis berdasarkan state mata uang (`mataUang`) aktif yang dipilih.
  * USD: `[USD 1, USD 2, USD 5, USD 10, USD 20, USD 50, USD 100]`
  * IDR: `[IDR 1000, IDR 2000, IDR 5000, IDR 10000, IDR 20000, IDR 50000, IDR 100000]`
* **💬 WhatsApp Dispatch Dispatcher**: Notifikasi otomatis siap kirim ke pihak ketiga dan pengawal melalui WhatsApp Gateway dengan template yang telah disesuaikan dengan nilai pecahan dari denominasi dinamis.
* **📎 Dukungan Base64 Attachments & Secure File Streaming**: Endpoint `/api/emails/:message_id/attachment/:filename` mengekstrak data lampiran Base64 secara instan langsung dari database SQLite/Supabase dan mengalirkannya kembali (*stream*) ke peramban pengguna secara aman.

---

## 🛠️ 5. Tech Stack (Spesifikasi Teknologi)

* **Frontend Framework**: React 18, Vite, Tailwind CSS, Lucide Icons, Framer Motion (Animasi Micro-interaction).
* **Backend Runtime**: Node.js Express Server, tsx (TypeScript Execution), esbuild (Ultra-fast bundler).
* **Databases**: Supabase PostgreSQL (Cloud State Sync) & SQLite 3 (Durable Local Storage Engine).
* **AI & Integration**: Axios murni, SDK `@google/genai`, dan SDK `openai` yang dikombinasikan dengan NVIDIA NIM API endpoints.

---

## 🚀 6. Memulai (Getting Started)

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

## 🛡️ 7. Penanganan Kesalahan & Ketahanan Sistem

* **API Timeout Protection**: Seluruh permintaan eksternal AI dipasangi batas waktu (timeout) 60 detik menggunakan Axios untuk meminimalkan penumpukan proses hanging.
* **Server 503 Detection**: Jendela Health Check mendeteksi status server sibuk (HTTP 503) pada model AI secara akurat dan menampilkan label "Server Penuh/Sibuk (503)" daripada crash senyap.
* **Double-Write Fallback**: Jika koneksi Supabase terputus, data tetap aman tersimpan di SQLite lokal dan siap digunakan secara independen tanpa disrupsi.
