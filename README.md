# 🤖 AI Operational Assistant Copilot (CIT & ATM Ticketing System)

[![React Version](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![Node.js Version](https://img.shields.io/badge/Backend-Node.js%20Express-green?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![Database Cloud](https://img.shields.io/badge/Database-Supabase%20%2B%20SQLite-darkgreen?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![LLM Models](https://img.shields.io/badge/AI%20Core-NVIDIA%20NIM%20%2B%20Moonshot-orange?style=for-the-badge&logo=nvidia)](https://www.nvidia.com/)

Sistem automasi ticketing berbasis email tingkat lanjut yang dirancang khusus untuk memproses pesanan **Cash In Transit (CIT)** dan pengisian uang tunai **ATM** secara cerdas, asinkron, dan real-time menggunakan arsitektur AI hibrida berkinerja tinggi.

---

## 📌 1. Project Overview (Ikhtisar Proyek)

**AI Operational Assistant Copilot** mengautomasi alur kerja manual pengolahan email operasional bernilai tinggi. Sistem secara otomatis menguping, membaca, dan menganalisis email masuk yang berisi instruksi rumit, mengekstraksi parameter operasional penting seperti **Bank Tujuan**, **Mata Uang**, **Total Nominal**, serta **Pecahan/Denominasi**, lalu mempresentasikannya ke dalam antarmuka dashboard operasional yang interaktif dan dinamis.

Dengan integrasi cerdas ini, tim operasional dapat memangkas waktu entri data manual dari beberapa menit menjadi dalam hitungan detik secara aman dan presisi tinggi.

---

## 🤖 2. Arsitektur AI Baru: Parallel Core & Mekanisme Fallback Terstruktur

Sistem ini didesain tangguh (*resilient*) menggunakan **Split-Task Parallel AI Architecture** yang berfokus pada kecepatan respon, ketahanan terhadap kegagalan API, pemadaman jaringan, maupun kuota rate limit (HTTP 429).

### Alur Flow Pemrosesan AI
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
  |    Model: Nemotron 3 Ultra (550b)        |  |    Model: Inkling                        |
  |    Engine: Axios Murni                   |  |    Engine: Axios Murni                   |
  |    Fitur: `enable_thinking: true`        |  |    Fitur: `max_tokens: 8192`             |
  +------------------------------------------+  +------------------------------------------+
               |                                             |
               +----------------------+----------------------+
                                      | (Merge Output JSON)
                                      v
                       +-----------------------------+
                       | Sukses? -> Simpan ke DB     |
                       +-----------------------------+
                                      |
                                      | (Jika Core Gagal)
                                      v
                       +-----------------------------+
                       | FALLBACK TIER 1             |
                       | Model: DeepSeek V4 Pro      |
                       | Engine: OpenAI SDK          |
                       +-----------------------------+
                                      |
                                      | (Jika Tier 1 Gagal)
                                      v
                       +-----------------------------+
                       | FALLBACK TIER 2             |
                       | Model: Gemma 4 31B          |
                       | Engine: Axios (Hardcoded)   |
                       +-----------------------------+
                                      |
                                      | (Jika Tier 2 Gagal)
                                      v
                       +-----------------------------+
                       | ABSOLUTE LAST RESORT        |
                       | Model: Minimax M3           |
                       | Engine: Axios Murni         |
                       +-----------------------------+
                                      |
                                      | (Jika Semua AI Gagal)
                                      v
                       +-----------------------------+
                       | Regex / Rule-Based Fallback |
                       +-----------------------------+
```

### ⚙️ Detail Arsitektur AI
1. **Parallel Execution Core:** 
   * **Nemotron 3 Ultra (nvidia/nemotron-3-ultra-550b-a55b):** Ditugaskan secara khusus untuk mengekstrak ringkasan operasional (`summary`), mata uang (`currency`), nominal (`total_amount`), bank tujuan (`suggested_bank`), wilayah cabang (`suggested_folder_parent`), serta instruksi khusus (`extracted_notes`). Dipanggil menggunakan **Axios murni** dengan parameter `chat_template_kwargs: { "enable_thinking": true }` dan `reasoning_budget: 16384` untuk kualitas penalaran tertinggi.
   * **Inkling (thinkingmachines/inkling):** Ditugaskan khusus untuk mengekstrak tipe tag (`suggested_tag`), tingkat urgensi (`urgency_level`), dan keputusan tindakan (`action_required`). Dipanggil menggunakan **Axios murni** dengan parameter `max_tokens: 8192`.
   * Panggilan ini dieksekusi secara konkuren (`Promise.all`) guna meminimalkan latency pemrosesan keseluruhan.
2. **Fallback Tier 1 (DeepSeek V4 Pro):** Jika eksekusi paralel core mengalami kendala, sistem akan jatuh ke **deepseek-ai/deepseek-v4-pro** menggunakan **OpenAI SDK** dengan parameter `chat_template_kwargs: { "thinking": false }` guna menjamin keandalan data ekstraksi tanpa overhead berlebih.
3. **Fallback Tier 2 (Gemma 4 31B):** Jika Fallback Tier 1 gagal, sistem secara otomatis merujuk ke **google/gemma-4-31b-it** dengan menggunakan pemanggilan **Axios murni** yang terisolasi secara kokoh dengan kredensial ter-hardcode di dalam fungsinya untuk keandalan eksekusi mutlak.
4. **Absolute Last Resort (Minimax M3):** Sebagai jaring pengaman AI terakhir, model **minimaxai/minimax-m3** dipanggil menggunakan Axios murni untuk memproses dan merestorasi seluruh data operasional dari teks email.
5. **Rule-Based Fallback:** Jika semua model AI di atas mengalami kegagalan total, sistem menggunakan algoritma reguler ekspresi (Regex) cerdas untuk menghindari hilangnya data transaksi.

---

## ✨ 3. Fitur Utama Secara Detail

* **🤖 Smart Split-Task JSON Extraction:** Memilah tugas pemrosesan email yang rumit menjadi sub-tugas paralel ke beberapa model AI terbaik di kelasnya untuk menghasilkan data terstruktur dengan format JSON yang sangat akurat.
* **🟢 Sistem AI Health Check & Diagnostics:** Endpoint `/api/settings/ai-health` mendiagnosis kesehatan masing-masing model AI secara real-time. Ping payload dioptimalkan tanpa streaming (`stream: false`) untuk mencegah deadlock atau hanging. Jika terjadi kegagalan atau timeout, pesan error detail dari API ditangkap dan dikirim ke dashboard untuk kemudahan debugging.
* **📧 UI Dasbor Tiket Interaktif (Gmail-Style):** Desain antarmuka modern yang nyaman dipandang. Menampilkan indikator status model AI yang memproses (misalnya Nemotron/Inkling, DeepSeek, Gemma, Minimax) secara dinamis.
* **📎 Dukungan Base64 Attachments:** File lampiran dikodekan langsung menjadi Base64 string terkompresi (maksimal 3MB) dan disimpan di database, meniadakan ketergantungan pada penyimpanan cloud eksternal yang rawan kebocoran data.
* **🔄 Event-Driven Real-time Updates:** Perubahan status analisis AI, sinkronisasi email, dan log penayangan disinkronkan secara instan ke frontend melalui log bergaya terminal yang elegan.
* **🗺️ Regional Branch Routing:** Email diklasifikasikan secara otomatis ke struktur regional (Region 1-10) dan kantor cabang pembantu berdasarkan kriteria pengirim atau subjek email secara instan.

---

## 🛠️ 4. Tech Stack (Spesifikasi Teknologi)

* **Frontend Framework:** React 18, Vite, Tailwind CSS, Lucide Icons, Framer Motion (Animasi Micro-interaction).
* **Backend Runtime:** Node.js Express Server, tsx (TypeScript Execution), esbuild (Ultra-fast bundler).
* **Databases:** Supabase PostgreSQL (Cloud State Sync) & SQLite 3 (Durable Local Storage Engine).
* **AI & Integration:** Axios murni & SDK `openai` yang dikombinasikan dengan NVIDIA NIM API endpoints.

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
   npm run start
   ```

---

## 🛡️ 6. Penanganan Kesalahan (Error Handling & Robustness)

* **API Timeout Protection:** Seluruh permintaan eksternal AI dipasangi batas waktu (timeout) 60 detik menggunakan Axios untuk meminimalkan penumpukan proses hanging.
* **Diagnostic Exception Capture:** Jika Health Check mengalami kendala, UI menampilkan status detail kesalahan (misal: `HTTP 400: Unsupported parameter` atau pesan asli server) untuk ketepatan diagnosis operasional.
* **Double-Write Fallback:** Jika koneksi Supabase terputus, data tetap aman tersimpan di SQLite lokal dan siap digunakan secara independen tanpa disrupsi.
