# 📖 Panduan Penggunaan Sistem (User Guide) - Workflow Email Ticketing System
*Untuk PIC Operasional & Administrator Sistem*

Selamat datang di **Workflow Email Ticketing System**! Dokumen ini dirancang secara komprehensif untuk membantu Anda (PIC) dalam mengoperasikan, mengelola, serta memaksimalkan efisiensi penanganan email masuk menggunakan kecerdasan buatan (**AI Operational Copilot**) bertenaga NVIDIA API yang kini dilengkapi dengan fitur pecahan dinamis dan pertahanan rate-limit otomatis.

---

## 📌 1. Pendahuluan & Konsep Utama

Aplikasi ini mengotomatiskan proses penanganan email masuk dari klien maupun server perbankan dengan alur kerja pintar:
1. **Syncing & Fetching**: Menarik pesan email dari server POP3 secara berkala (otomatis setiap 3 menit atau manual melalui tombol).
2. **AI Analysis (NVIDIA AI)**: Setiap email dianalisis isinya untuk mendeteksi ringkasan (Summary), urgensi, kebutuhan tindakan, dan rekomendasi penempatan folder operasional secara instan.
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

## 💵 3. Manajemen Pecahan & Denominasi Dinamis (CIT / ATM Order)

Saat Anda membuat atau menyunting rincian pesanan **Cash In Transit (CIT)** atau pengiriman **ATM** melalui modal disposisi, Anda akan disajikan dengan bagian **Pecahan & Denominasi Dynamic**:

### 📊 3.1. Penyesuaian Mata Uang Otomatis (IDR vs USD)
* **Sinkronisasi Mata Uang**: Label bagian pecahan akan mengikuti jenis mata uang yang dipilih pada kolom pilihan mata uang (misal: **IDR** atau **USD**).
* **Dropdown Pilihan Dinamis**:
  * Jika mata uang aktif adalah **USD**, sistem secara otomatis memuat pilihan pecahan nominal USD: `[USD 1, USD 2, USD 5, USD 10, USD 20, USD 50, USD 100]`.
  * Jika mata uang aktif adalah **IDR**, sistem secara otomatis beralih memuat pilihan pecahan rupiah: `[IDR 1000, IDR 2000, IDR 5000, IDR 10000, IDR 20000, IDR 50000, IDR 100000]`.

### 🧮 3.2. Logika Hitung & Validasi Selisih
* **Total Hasil Hitung (`totalHitung`)**: Setiap kali Anda mengubah nominal pecahan maupun kuantitas lembar uang, subtotal per baris dan total keseluruhan hasil perhitungan akan diperbarui secara real-time.
* **Deteksi Selisih Otomatis**: Sistem akan membandingkan **Total Nominal Form** (jumlah pesanan utama) dengan **Total Hasil Hitung Pecahan**.
  * Jika terjadi ketidaksesuaian nominal, sistem menampilkan kotak peringatan berwarna kuning beserta rincian jumlah selisih secara transparan (Pecahan kurang atau berlebih).
  * Anda dapat menekan tombol **"Samakan Nominal"** untuk menyamakan nominal pesanan utama dengan jumlah hasil hitung pecahan secara instan.
* **Manual Override**: Meskipun terjadi selisih, operator tetap diberikan wewenang untuk menekan tombol kirim order (Manual Override) apabila situasi operasional di lapangan memerlukan toleransi khusus.

---

## ⚙️ 4. Menu Pengaturan & Penanganan Rate-Limit

Klik menu **"Settings"** di bilah navigasi kiri untuk masuk ke halaman konfigurasi sistem tingkat lanjut:

### 🔍 4.1. Custom Filter Rules
Halaman untuk mengelola aturan filter otomatis yang telah Anda buat:
* Aturan mencakup kriteria pengirim, kata kunci subjek, atau kata kunci isi pesan, serta menetapkan ke folder tujuan mana email tersebut harus diarahkan secara otomatis di masa mendatang.

### 🧪 4.2. AI Health & Diagnostics Tab
* Memungkinkan administrator untuk melihat status kesehatan real-time dari model AI (**Nemotron 3 Ultra**, **Inkling**, **DeepSeek V4 Pro**, **Gemma 4**, dan **Minimax M3**).
* Jika model tertentu mengalami status sibuk/penuh (HTTP 503) atau tidak merespons, status akan menampilkan indikator peringatan detail agar PIC dapat beralih atau memantau performa model cadangan.

### 🕒 4.3. Historical Data Backfill & Mekanisme Pengaman API
Fitur khusus bagi PIC saat melakukan migrasi atau jika terdapat data email lama dalam jumlah besar yang belum teranalisis AI:
1. **Throttling Cerdas**: Sistem memproses antrean email secara bertahap dalam kelompok kecil berisi **5 email per batch**.
2. **Jeda Waktu Aman (15-20 Detik)**: Antar batch diberi jeda istirahat selama 15 hingga 20 detik untuk mengembalikan kuota batas pemanggilan pada NVIDIA NIM API secara berkala agar terhindar dari pemblokiran.
3. **Resiliensi Auto-Retry**: Jika batas **40 RPM** NVIDIA tercapai, sistem akan memicu respons *Exponential Backoff*—menunda aktivitas selama **30 detik** sebelum mengulangi proses pengerjaan secara otomatis.

---

## ⚠️ 5. Penanganan Masalah (Troubleshooting) & Tips Operasional

* **Tanya**: Mengapa proses sinkronisasi massal (*Bulk AI*) atau *Backfill* terasa berjalan lebih lambat dibanding versi awal?
  * **Jawab**: Ini adalah fitur pengaman baru yang dirancang agar sistem Anda tidak diblokir oleh server AI NVIDIA (limit 40 RPM). Memproses email dalam batch berisi 5 item dengan jeda 15 detik menjamin stabilitas 100% tanpa adanya error crash di tengah jalan.
* **Tanya**: Mengapa muncul kotak peringatan berwarna kuning saat mengisi pecahan CIT?
  * **Jawab**: Itu menunjukkan jumlah perkalian pecahan uang Anda (misal: 100 lembar x $50 = $5000) berbeda dengan nilai nominal utama yang Anda input pada form atas. Anda dapat mengecek kembali jumlah lembar uang atau mengklik tombol **"Samakan Nominal"** untuk membetulkannya secara cepat.
* **Tanya**: Apa yang terjadi jika seluruh sistem AI NVIDIA mendadak down atau mati?
  * **Jawab**: Aplikasi ini dilengkapi dengan **Rule-Based Regex Fallback** serta database lokal SQLite. Data email Anda tidak akan pernah hilang dan tetap tersimpan utuh. Setelah server AI pulih, Anda cukup menggunakan menu **Historical Data Backfill** untuk mengisi ulang seluruh analisis AI yang tertunda.

---

*Terima kasih atas dedikasi Anda dalam menjaga kelancaran operasional ticketing! Jika ada kendala sistem lebih lanjut, silakan hubungi tim administrator IT.*
