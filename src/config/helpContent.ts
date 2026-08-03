export interface HelpSection {
  title: string;
  menuKey: string;
  subtitle: string;
  usageTitle: string;
  usageOverview: string;
  steps: string[];
  glossaryTitle: string;
  glossary: { term: string; description: string }[];
}

export const HELP_CONTENT: Record<string, HelpSection> = {
  inbox: {
    menuKey: 'inbox',
    title: 'Workflow Email Ticketing System',
    subtitle: 'Panduan penggunaan kotak masuk email otomatis dan ekstraksi intelijen AI',
    usageTitle: '📖 Cara Menggunakan Fitur Ini',
    usageOverview: 'Menu ini menyajikan seluruh email masuk dari seluruh bank & client. Sistem secara otomatis menarik email via POP3, mengekstrak tiket ATM/CIT, dan mengelompokkan pesan ke dalam folder serta status pengerjaan.',
    steps: [
      'Pilih akun email pengirim atau pilih "Semua Akun Email (Unified Inbox)" pada selector header.',
      'Gunakan kolom pencarian di bagian atas untuk menemukan email berdasarkan subjek, pengirim, atau keyword.',
      'Klik tombol "Manual Sync POP3" jika ingin memaksa penarikan email baru secara langsung dari server mail.',
      'Pilih salah satu email di daftar kiri untuk melihat isi pesan HTML/Plain Text, lampiran, dan tag otomatis AI di panel kanan.',
      'Gunakan tombol "Proses AI Re-Analyze" jika ingin menjalankan ulang ekstraksi AI pada email yang dipilih.'
    ],
    glossaryTitle: '📝 Penjelasan Field (Glossary)',
    glossary: [
      { term: 'Message ID', description: 'Kode unik pengenal email dari header POP3/SMTP mail server.' },
      { term: 'Folder Parent / Child', description: 'Kategori folder utama dan sub-folder cabang yang ditentukan otomatis oleh Dynamic Filter.' },
      { term: 'Tag Email', description: 'Kategori tipe tiket seperti CIT, ATM, FLM, SLM, SIT, atau Other.' },
      { term: 'AI Status', description: 'Status pengerjaan analisis LLM: PENDING (Menunggu), COMPLETED (Berhasil), atau FAILED (Gagal).' },
      { term: 'Nomor Tiket', description: 'Kode tiket gangguan atau perintah kerja yang diekstrak dari teks email.' }
    ]
  },
  'cit-dashboard': {
    menuKey: 'cit-dashboard',
    title: 'CIT Dispatch & Multi-Order Form',
    subtitle: 'Panduan pengelolaan order armada CIT, penjadwalan kas, dan cetak instruksi kerja',
    usageTitle: '📖 Cara Menggunakan Fitur Ini',
    usageOverview: 'Halaman CIT Dispatch Management berfungsi mengelola seluruh permintaan pengawalan & pengiriman uang tunai (Cash-In-Transit) yang masuk dari email bank client. Anda dapat memvalidasi tiket, mengalokasikan armada/petugas, dan mencetak dokumen dispatch resmi.',
    steps: [
      'Tinjau daftar order masuk di tabel utama. Order baru yang diekstrak otomatis dari email akan ditandai warna biru.',
      'Klik tombol "Edit / Assign" pada order untuk membuka Multi-Order Modal Form.',
      'Isi rincian denominasi uang (Rp 100rb, Rp 50rb), bank tujuan, nomor segel bag, dan tentukan Siklus / Jam Operasional.',
      'Pilih Tim CIT, Kendaraan, dan Petugas Pengawal yang bertugas membawa uang.',
      'Simpan order, lalu klik "Cetak Dispatch Note" untuk mengunduh dokumen penyerahan kas resmi.'
    ],
    glossaryTitle: '📝 Penjelasan Field (Glossary)',
    glossary: [
      { term: 'Siklus', description: 'Waktu / periode operasional pengiriman uang (Contoh: Siklus 1 Pagi, Siklus 2 Siang).' },
      { term: 'Client / Bank', description: 'Entitas bank pemilik kas (BCA, Mandiri, BRI, BNI, CIMB Niaga, dll).' },
      { term: 'Denominasi', description: 'Pecahan nominal lembaran uang rupiah yang dikemas dalam bag atau cassette.' },
      { term: 'Bag / Seal Number', description: 'Nomor pengaman segel plastik/kantong uang tunai yang dibawa oleh armada.' },
      { term: 'Total Nominal', description: 'Jumlah akumulasi nilai rupiah kas yang dipindahkan dalam transaksi CIT.' },
      { term: 'Tim / Custody', description: 'Nama driver, petugas kas, dan personel pengamanan kepolisian yang ditugaskan.' }
    ]
  },
  'bulk-summary': {
    menuKey: 'bulk-summary',
    title: 'Daily Bulk Email Summary & WA Blast',
    subtitle: 'Panduan generasi rangkuman harian email otomatis dan distribusi WhatsApp Blast',
    usageTitle: '📖 Cara Menggunakan Fitur Ini',
    usageOverview: 'Fitur ini merangkum seluruh email operasional yang masuk dalam satu hari menjadi laporan eksekutif padat berbasis AI, serta memungkinkan pengiriman laporan otomatis ke grup WhatsApp operasional.',
    steps: [
      'Pilih tanggal laporan yang ingin dirangkum menggunakan pemilih tanggal.',
      'Klik tombol "Generate Daily Summary Now" untuk memicu AI meringkas puluhan/ratusan email masuk.',
      'Tinjau hasil ringkasan teks AI di kartu ringkasan harian.',
      'Klik "Lihat Detail" untuk memeriksa daftar email referensi yang menjadi sumber rangkuman.',
      'Klik tombol "Blast WA Sekarang" untuk membroadcast teks ringkasan langsung ke nomor/grup WhatsApp terdaftar.'
    ],
    glossaryTitle: '📝 Penjelasan Field (Glossary)',
    glossary: [
      { term: 'Tanggal Summary', description: 'Tanggal kalender target yang email-emailnya dikompilasi oleh AI.' },
      { term: 'Content Text', description: 'Teks hasil olahan AI Gemini berisi statistik tiket, total order, dan pending item.' },
      { term: 'Status WA Blast', description: 'Indikator apakah rangkuman hari tersebut sudah pernah dikirimkan ke WhatsApp atau belum.' },
      { term: 'Source Emails', description: 'Rincian pesan email masuk yang digunakan AI sebagai bahan dasar penyusunan laporan.' }
    ]
  },
  'superadmin-tenants': {
    menuKey: 'superadmin-tenants',
    title: 'Multi-Tenant & User Admin Management',
    subtitle: 'Panduan isolasi data divisi, manajemen tenant, dan kontrol hak akses user',
    usageTitle: '📖 Cara Menggunakan Fitur Ini',
    usageOverview: 'Modul ini dikhususkan untuk Super Admin guna mengelola isolasi data antar divisi/tenant, mendaftarkan akun pengguna baru, serta mengatur hak akses menu (Permissions) per divisi.',
    steps: [
      'Lihat daftar Divisi/Tenant yang aktif pada tabel Tenant Management.',
      'Klik "Tambah Tenant Baru" untuk mendaftarkan divisi atau cabang operasional baru.',
      'Gunakan modal User Management untuk membuat akun login staf dengan role SUPER_ADMIN, TENANT_ADMIN, atau USER.',
      'Centang/dekonsentrasikan matriks izin (Permission Matrix) untuk membatasi akses menu tertentu (misal: hanya CIT Dispatch).'
    ],
    glossaryTitle: '📝 Penjelasan Field (Glossary)',
    glossary: [
      { term: 'Tenant ID', description: 'Identitas unik angka yang mengisolasi data email, order, dan setting per divisi.' },
      { term: 'Role User', description: 'Tingkat wewenang pengguna: SUPER_ADMIN (Akses Penuh), TENANT_ADMIN (Admin Divisi), USER (Staff Operator).' },
      { term: 'Permission Matrix', description: 'Sakelar izin ON/OFF untuk mengontrol menu mana saja yang boleh dibuka oleh user tenant tersebut.' }
    ]
  },
  'dynamic-filters': {
    menuKey: 'dynamic-filters',
    title: 'Master Dynamic Filters Routing (1-6)',
    subtitle: 'Panduan pemetaan kata kunci email ke Region & Branch operasional CIT',
    usageTitle: '📖 Cara Menggunakan Fitur Ini',
    usageOverview: 'Master data ini menentukan aturan penyaringan email masuk berdasarkan kata kunci domain atau pengirim untuk memetakan pesan secara otomatis ke Region 1 s/d 6 dan Kantor Cabang.',
    steps: [
      'Gunakan filter Region 1-6 di bagian atas untuk menyaring aturan berdasarkan wilayah operasional.',
      'Klik "Seed Master Data (1-6)" untuk memuat otomatis 30+ aturan standar wilayah Advantage SCM.',
      'Klik "Tambah Filter Baru" atau ikon edit untuk menyesuaikan domain email client per cabang.'
    ],
    glossaryTitle: '📝 Penjelasan Field (Glossary)',
    glossary: [
      { term: 'Region', description: 'Wilayah supervisi operasional CIT (Region 1 Sumatra, Region 2 Kalimantan, Region 3 Jakarta, dll).' },
      { term: 'Branch', description: 'Nama kantor cabang operasional penerima pesan (Contoh: MERUYA, PALEMBANG, SURABAYA).' },
      { term: 'Address Filters', description: 'Daftar kata kunci domain/email yang dipisahkan koma untuk matching pesan masuk.' }
    ]
  },
  'tenant-settings': {
    menuKey: 'tenant-settings',
    title: 'Mail & WA Integration Setup',
    subtitle: 'Panduan konfigurasi akun POP3/SMTP dan API WhatsApp per Divisi',
    usageTitle: '📖 Cara Menggunakan Fitur Ini',
    usageOverview: 'Halaman ini digunakan oleh Tenant Admin untuk menghubungkan server email POP3/SMTP divisi serta mendaftarkan kredensial WhatsApp Gateway untuk fitur notifikasi otomatis.',
    steps: [
      'Isi Host POP3, Port (995 SSL / 110), Username, dan Password email divisi Anda.',
      'Klik "Uji Koneksi POP3" untuk memastikan server mail dapat diakses.',
      'Pilih provider WhatsApp (WPPConnect, Fonnte, Wablas) dan masukkan API Token / QR Code.'
    ],
    glossaryTitle: '📝 Penjelasan Field (Glossary)',
    glossary: [
      { term: 'POP3 Server', description: 'Alamat server penerima email (contoh: pop.gmail.com atau pop3.perusahaan.com).' },
      { term: 'Sync Interval', description: 'Interval waktu pengecekan otomatis email baru dalam hitungan menit.' },
      { term: 'WA Provider', description: 'Layanan gateway pengiriman pesan WhatsApp otomatis yang diintegrasikan.' }
    ]
  },
  'redis-monitor': {
    menuKey: 'redis-monitor',
    title: 'AI Queue & Redis BullMQ Monitor',
    subtitle: 'Panduan pemantauan antrean pemrosesan AI real-time dan error retry',
    usageTitle: '📖 Cara Menggunakan Fitur Ini',
    usageOverview: 'Dashboard pemantauan antrean Redis BullMQ khusus Super Admin untuk mengawasi kinerja beban kerja analisis LLM/Gemini AI, status job, serta melakukan retry pada job yang mengalami error.',
    steps: [
      'Amati 4 kartu metrik di bagian atas: Waiting (Antrean), Active (Proses AI), Completed (Selesai), dan Failed (Gagal).',
      'Periksa tabel Completed Jobs untuk melihat riwayat email yang berhasil dianalisis beserta durasi eksekusinya.',
      'Jika ada job di tabel Failed Logs, baca pesan error/stack trace, lalu klik "Retry Job" untuk memancing ulang pemrosesan AI.'
    ],
    glossaryTitle: '📝 Penjelasan Field (Glossary)',
    glossary: [
      { term: 'Waiting', description: 'Jumlah job email yang sedang mengantre di Redis menunggu giliran diproses AI.' },
      { term: 'Active', description: 'Job email yang saat ini sedang diproses secara paralel oleh AI Worker.' },
      { term: 'Completed', description: 'Total job yang telah sukses diurai dan disimpan ke database.' },
      { term: 'Failed / Error Trace', description: 'Daftar kegagalan akibat timeout AI/rate limit beserta pesan detail kesalahannya.' }
    ]
  },
  settings: {
    menuKey: 'settings',
    title: 'Automation Rules & System Settings',
    subtitle: 'Panduan pengelolaan aturan otomatisasi, kunci API AI, dan kesehatan sistem',
    usageTitle: '📖 Cara Menggunakan Fitur Ini',
    usageOverview: 'Konfigurasi global sistem untuk mengatur kata kunci otomasi email, memasukkan API Key Gemini/OpenAI, serta mengecek status kesehatan layanan backend.',
    steps: [
      'Buka tab "Aturan Otomasi" untuk menambahkan kata kunci matching email.',
      'Buka tab "API Keys" untuk mengatur kredensial model AI.',
      'Gunakan tab "AI Health" untuk memantau waktu respon server LLM.'
    ],
    glossaryTitle: '📝 Penjelasan Field (Glossary)',
    glossary: [
      { term: 'Custom Filter', description: 'Aturan kondisional gabungan pengirim + subjek untuk aksi tertentu.' },
      { term: 'Gemini API Key', description: 'Kunci otentikasi Google AI Studio untuk mengaktifkan ekstraksi cerdas.' }
    ]
  }
};
