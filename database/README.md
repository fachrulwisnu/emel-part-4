# 🗄️ PostgreSQL Database Setup & Schema Import Guide

Panduan langkah demi langkah untuk menginisialisasi dan menduplikasi struktur database PostgreSQL untuk **Enterprise Multi-Tenant SaaS Email AI Automation Platform**.

---

## 📌 Prasyarat (Prerequisites)

1. **PostgreSQL Server 12+** terinstal dan berjalan pada sistem lokal atau Cloud database (misal: Supabase, Neon, AWS RDS, GCP Cloud SQL).
2. Memiliki file `database/schema.sql`.
3. Akses admin ke PostgreSQL (`postgres` superuser).

---

## 🛠️ OPSI 1: Import via Command Line Interface (`psql`)

Gunakan cara ini jika Anda terbiasa dengan terminal / command line interface.

### Langkah 1: Buat Database Baru
Buka terminal / Command Prompt, lalu masuk ke psql console:
```bash
psql -U postgres
```
Buat database bernama `emails_db`:
```sql
CREATE DATABASE emails_db;
\q
```

### Langkah 2: Eksekusi Import Schema
Jalankan perintah berikut dari root direktori proyek:
```bash
psql -U postgres -d emails_db -f ./database/schema.sql
```

*(Jika diminta password, masukkan password user `postgres` Anda).*

### Langkah 3: Verifikasi Tabel
Buka kembali console `psql`:
```bash
psql -U postgres -d emails_db
```
Cek daftar tabel yang berhasil dibuat:
```sql
\dt
```
Output yang diharapkan:
```text
               List of relations
 Schema |      Name       | Type  |  Owner   
--------+-----------------+-------+----------
 public | custom_filters  | table | postgres
 public | daily_summaries | table | postgres
 public | email_analysis  | table | postgres
 public | emails          | table | postgres
 public | tenants         | table | postgres
 public | users           | table | postgres
 public | wa_sessions     | table | postgres
(7 rows)
```

---

## 🖥️ OPSI 2: Import via GUI (pgAdmin 4)

Gunakan cara ini jika Anda menggunakan GUI pgAdmin.

1. **Buka pgAdmin 4** dan hubungkan ke server PostgreSQL lokal/remote Anda.
2. **Buat Database Baru**:
   - Klik kanan pada **Databases** -> **Create** -> **Database...**
   - Isi **Database Name**: `emails_db`
   - Klik **Save**.
3. **Buka Query Tool**:
   - Klik kanan pada database `emails_db` yang baru dibuat -> **Query Tool**.
4. **Buka File `schema.sql`**:
   - Klik ikon folder (*Open File*) pada bagian toolbar Query Tool.
   - Pilih file `database/schema.sql` yang ada di proyek ini.
5. **Eksekusi SQL**:
   - Tekan tombol **Execute / Refresh (F5)** atau klik ikon segitiga (Play).
   - Pastikan pesan output menampilkan `Query returned successfully`.

---

## 🔑 Kredensial Default Terbuka (Initial Seed Accounts)

Setelah eksekusi `schema.sql`, database secara otomatis menyertakan akun default berikut:

| Role | Username / Email | Password | Tenant Access |
| :--- | :--- | :--- | :--- |
| **SUPER_ADMIN** | `fachrul` | `bosskubabi` | Global (Semua Divisi) |
| **TENANT_ADMIN** | `cos` | `12345678` | Divisi COS |

---

## ⚙️ Integrasi Environment Variable (`.env`)

Setelah database siap, pastikan variabel koneksi database di file `.env` root proyek mengarah ke database tersebut:

```env
# PostgreSQL Connection URI
POSTGRES_URI=postgresql://postgres:password_anda@localhost:5432/emails_db
```

Selesai! Aplikasi kini siap dihubungkan ke database PostgreSQL Enterprise.
