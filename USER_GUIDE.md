# 📖 Panduan Penggunaan Sistem (User Guide) - Workflow Email Ticketing System
*Untuk PIC Operasional & Administrator Sistem*

Selamat datang di **Workflow Email Ticketing System**! Dokumen ini dirancang secara komprehensif untuk membantu Anda (PIC) dalam mengoperasikan, mengelola, serta memaksimalkan efisiensi penanganan email masuk menggunakan kecerdasan buatan (**AI Operational Copilot**) bertenaga NVIDIA API dan Google Gemini yang kini dilengkapi dengan fitur pecahan dinamis, pertahanan rate-limit otomatis, dan monitor kesehatan AI secara real-time.

---

## 📌 1. Pendahuluan & Konsep Utama

Aplikasi ini mengotomatiskan proses penanganan email masuk dari klien maupun server perbankan dengan alur kerja pintar:
1. **Syncing & Fetching**: Menarik pesan email dari server POP3 secara berkala (otomatis setiap 3 menit atau manual melalui tombol).
2. **AI Analysis (NVIDIA AI & Gemini)**: Setiap email dianalisis isinya untuk mendeteksi ringkasan (Summary), urgensi, kebutuhan tindakan, dan rekomendasi penempatan folder operasional secara instan.
3. **Smart Actions**: Memungkinkan Anda untuk mengonfirmasi penempatan folder operasional, mengubah rekomendasi, membuat aturan filter otomatis (*Automation Filter Routing*), serta menerbitkan tiket Cash In Transit (CIT) / ATM Dispatch secara langsung.

---

## 🚀 2. Panduan Fitur Utama & Cara Penggunaan

### 📥 2.1. Panel Inbox & Monitoring Real-time
Saat pertama kali membuka aplikasi, Anda akan disuguhkan oleh **Inbox Utama**:
* **Daftar Email**: Menampilkan daftar email masuk lengkap dengan subjek, pengirim, tanggal, status pembacaan, kategori, serta level urgensi (**High** / **Medium** / **Low** / **Routine**).
* **Indikator Urgensi Warna**:
  * 🔴 **High** / **Peringatan**: Memerlukan tindakan mendesak (misal: order dropping tunai, limit saldo, geofence bermasalah).
  * 🟡 **Medium**: Memerlukan pemantauan berkala.
  * 🟢 **Low** / 🔵 **Routine**: Bersifat informasional/notifikasi sistem rutin.
* **Sync Button**: Klik tombol **"Sync Inbox"** di pojok kanan atas untuk menarik email terbaru seketika dari server POP3.

---

### 💡 2.2. Detail Analisis AI & "Smart Apply"
Ketika Anda mengklik salah satu email di daftar inbox, panel kanan akan menampilkan detail email lengkap beserta **AI Operational Copilot Pane**:

#### **A. Tampilan Analisis AI**
* **Summary (Ringkasan)**: Ringkasan singkat isi email dalam 1-2 kalimat bahasa Indonesia yang langsung menjelaskan inti permintaan.
* **Action Required (Tindakan Diperlukan)**: Indikator cepat apakah Anda harus membalas/memproses email ini atau sekadar membaca.
* **Suggested Folder**: Folder induk (Parent) dan folder anak (Child) tujuan yang disarankan secara pintar oleh AI (Contoh: `Bank Maybank / Collection`).

#### **B. Tombol "Smart Apply" (Satu-Klik Terapkan)**
* Jika rekomendasi AI sudah sesuai, klik tombol **"Smart Apply"**.
* **Efek Otomatis**:
  1. Sistem akan langsung memindahkan email ke folder dan subfolder tersebut secara permanen.
  2. Status penting (*is_important*) otomatis aktif apabila level urgensi dinilai **High**.
  3. Data tersinkronisasi instan ke database SQLite lokal dan Cloud Supabase.

---

### 🔮 2.3. Dasbor Intelijen Email AI (AI Email Intelligence Dashboard)
Guna meningkatkan fungsionalitas pengarsipan dan analisis dokumen, Anda kini dibekali halaman khusus intelijen email yang dipisahkan dari alur inbox harian:

1. **Cara Mengakses**:
   * Klik ikon berkilau **(Sparkles Icon / "Email Intelligence")** pada bilah navigasi menu utama sebelah kiri.
2. **Navigasi Pohon Folder (Folder Tree Accordion)**:
   * Bilah kiri menyajikan seluruh email yang dikelompokkan secara terstruktur.
   * **Level 1 (Parent)**: Menunjukkan Bank Utama atau Kategori Operasional (misal: *Bank Mandiri*, *Bank Maybank*, *Operation*, *Uncategorized*).
   * **Level 2 (Child)**: Menunjukkan sub-klasifikasi operasional seperti *Collection*, *ATM*, *CIT*, atau *General*.
   * Di setiap level folder, terdapat **Badge Counter** berwarna kontras yang memperlihatkan secara akurat berapa jumlah tiket email yang tersarang di dalamnya. Klik nama folder untuk membentangkan (*expand*) atau melipat kembali (*collapse*).
3. **Tombol "Kelola Antrean Intelligence" & Queue Management Modal**:
   * Di bawah menu navigasi pohon folder sebelah kiri, Anda akan melihat tombol **"Kelola Antrean Intelligence (X Pending)"**.
   * Klik tombol ini untuk membuka **AI Intelligence Queue Management Modal**.
   * Di dalam modal, Anda dapat memantau bar progres "Diproses: X dari Y Email" beserta persentasenya, daftar antrean pending, dan terminal log box hitam yang terhubung ke Server-Sent Events (SSE). Anda dapat memulai proses massal dengan mengeklik tombol **"Bulk Analyze"**.
4. **Analisis Berkas Lampiran (Ultimate AI Rotator)**:
   * AI memproses berkas secara ephemeral menggunakan arsitektur rotasi bertingkat:
     * **GAMBAR (.jpg, .png, dsb)**: Di-rotasikan otomatis berurutan dari **Cosmos3-Nano-Reasoner** ➡️ **Gemini 3.5 Flash** ➡️ **Qwen3-Next-80B** ➡️ **StepFun-3.7-Flash** demi keakuratan ekstraksi OCR visual terbaik.
     * **DOKUMEN/TEKS (.txt, .pdf, dsb)**: Di-analisis berurutan dari **Qwen3-Next-80B** ➡️ **StepFun-3.7-Flash** ➡️ **Gemini 3.5 Flash** untuk ringkasan isi dokumen yang padat dan informatif.
     * **Kompresi & Proteksi Ukuran**: Berkas gambar di-kompresi secara dinamis dengan library `sharp` agar payload berada di bawah limit API 180KB. Berkas di atas **20MB** akan secara otomatis dilewati (*skip*) untuk memproteksi kestabilan memori runtime server.
5. **Secure Real-time Streaming & Download**:
   * Jika Anda memerlukan berkas lampiran aslinya, cukup tekan tombol **"Download"** pada baris lampiran yang diinginkan.
   * Sistem akan mengonversi biner terkompresi Base64 dari database, membungkusnya ke dalam struktur stream biner real-time, lalu mengalirkannya langsung ke peramban web PIC secara aman dan cepat.

---

## 🟢 3. Sistem AI Health Check & Diagnostics (Real-time Monitor)

Di pojok kiri atas sistem header (bersebelahan dengan indikator Database status), Anda akan melihat tombol indikator **"AI Health: Online"** atau **"AI Health: Degraded"**:
* **Lampu Indikator**:
  * 🟢 **Hijau**: Menandakan seluruh sistem kecerdasan utama (**Cosmos3-Nano-Reasoner**, **Gemini 3.5 Flash**, **Qwen3-Next-80B**, dan **StepFun-3.7-Flash**) berfungsi penuh dengan status online.
  * 🔴 **Merah**: Menunjukkan satu atau lebih model mengalami kegagalan, kehabisan kuota, atau waktu habis (timeout).
* **Popover Panel**:
  * Klik tombol indikator tersebut untuk menampilkan panel detail monitor.
  * Anda akan disuguhi status aktif, latensi respons aktual (Response Time) dalam milidetik, serta rincian pesan kesalahan saat kegagalan terjadi untuk setiap model secara terpisah.
  * Tekan tombol **"Refresh Now"** di dalam panel untuk memicu pemeriksaan kesehatan instan secara manual. Sistem juga melakukan pembaruan otomatis di latar belakang setiap **60 detik**.

---

## 💵 4. Manajemen Pecahan & Denominasi Dinamis (CIT / ATM Order)

Saat Anda membuat atau menyunting rincian pesanan **Cash In Transit (CIT)** atau pengiriman **ATM** melalui modal disposisi, Anda akan disajikan dengan bagian **Pecahan & Denominasi Dynamic**:

### 📊 4.1. Penyesuaian Mata Uang Otomatis (IDR vs USD)
* **Sinkronisasi Mata Uang**: Label bagian pecahan akan mengikuti jenis mata uang yang dipilih pada kolom pilihan mata uang (misal: **IDR** atau **USD**).
* **Dropdown Pilihan Dinamis**:
  * Jika mata uang aktif adalah **USD**, sistem secara otomatis memuat pilihan pecahan nominal USD: `[USD 1, USD 2, USD 5, USD 10, USD 20, USD 50, USD 100]`.
  * Jika mata uang aktif adalah **IDR**, sistem secara otomatis beralih memuat pilihan pecahan rupiah: `[IDR 1000, IDR 2000, IDR 5000, IDR 10000, IDR 20000, IDR 50000, IDR 100000]`.

### 🧮 4.2. Logika Hitung & Validasi Selisih
* **Total Hasil Hitung (`totalHitung`)**: Setiap kali Anda mengubah nominal pecahan maupun kuantitas lembar uang, subtotal per baris dan total keseluruhan hasil perhitungan akan diperbarui secara real-time.
* **Deteksi Selisih Otomatis**: Sistem akan membandingkan **Total Nominal Form** (jumlah pesanan utama) dengan **Total Hasil Hitung Pecahan**.
  * Jika terjadi ketidaksesuaian nominal, sistem menampilkan kotak peringatan berwarna kuning beserta rincian jumlah selisih secara transparan (Pecahan kurang atau berlebih).
  * Anda dapat menekan tombol **"Samakan Nominal"** untuk menyamakan nominal pesanan utama dengan jumlah hasil hitung pecahan secara instan.
* **Manual Override**: Meskipun terjadi selisih, operator tetap diberikan wewenang untuk menekan tombol kirim order (Manual Override) apabila situasi operasional di lapangan memerlukan toleransi khusus.

---

## ⚠️ 5. Penanganan Masalah (Troubleshooting) & Tips Operasional

* **Tanya**: Mengapa proses sinkronisasi massal (*Bulk AI*) atau *Backfill* terasa berjalan lebih lambat dibanding versi awal?
  * **Jawab**: Ini adalah fitur pengaman baru yang dirancang agar sistem Anda tidak diblokir oleh server AI NVIDIA (limit 40 RPM). Memproses email dalam batch berisi **2 item** secara konkuren dengan jeda **15 detik** menjamin stabilitas 100% tanpa adanya error crash di tengah jalan.
* **Tanya**: Mengapa muncul kotak peringatan berwarna kuning saat mengisi pecahan CIT?
  * **Jawab**: Itu menunjukkan jumlah perkalian pecahan uang Anda (misal: 100 lembar x $50 = $5000) berbeda dengan nilai nominal utama yang Anda input pada form atas. Anda dapat mengecek kembali jumlah lembar uang atau mengklik tombol **"Samakan Nominal"** untuk membetulkannya secara cepat.
* **Tanya**: Apa yang terjadi jika seluruh sistem AI NVIDIA mendadak down atau mati?
  * **Jawab**: Sistem secara dinamis akan beralih (*cascading fallback*) ke model Google Gemini 3.5 Flash, dilanjutkan ke DeepSeek dan Gemma, lalu beralih ke Rule-Based Regex Fallback yang tersimpan lokal di SQLite. Operasional penanganan tiket Anda dijamin tetap stabil berjalan 100% tanpa hambatan.
