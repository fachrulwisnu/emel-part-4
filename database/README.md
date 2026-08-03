# Panduan Inisialisasi Database PostgreSQL

Dokumen ini berisi panduan langkah-demi-langkah bagi pengembang/developer untuk melakukan setup dan import struktur database PostgreSQL dari file `database/schema.sql`.

---

## 📋 Prasyarat
- **PostgreSQL**: Server PostgreSQL versi 13 atau yang lebih baru.
- **Ekstensi**: Memerlukan akses *Superuser* / *Database Owner* untuk mengaktifkan ekstensi `pgcrypto`.
- **CLI Tools**: `psql` (PostgreSQL Interactive Terminal).

---

## 🚀 Langkah Import Database

### Langkah 1: Buat Database Baru
Buka terminal dan jalankan perintah psql untuk membuat database baru (misal: `email_system_db`):
```bash
createdb -U postgres -h localhost email_system_db
```
Atau via `psql`:
```sql
CREATE DATABASE email_system_db;
```

### Langkah 2: Eksekusi File Schema DDL
Jalankan perintah berikut di terminal Anda untuk mengimpor seluruh tabel, indeks, constraint, dan data inisialisasi:
```bash
psql -U postgres -h localhost -d email_system_db -f database/schema.sql
```

---

## 🔑 Kredensial Default Pengguna (Seeding)

Setelah schema berhasil di-import, sistem akan otomatis menyediakan akun berikut:

| Email / Username | Password Default | Role | Keterangan |
|---|---|---|---|
| `fachrul` | `bosskubabi` | `SUPER_ADMIN` | Memiliki akses penuh ke seluruh manajemen tenant dan AI config |
| `cos` | `12345678` | `TENANT_ADMIN` | Admin Divisi COS dengan fitur Individual Email Parsing |

---

## ⚙️ Integrasi dengan Aplikasi (Environment Variable)

Buka file `.env` di root proyek dan atur string koneksi PostgreSQL:
```env
POSTGRES_URL=postgres://postgres:password_anda@localhost:5432/email_system_db
```
Saat server dinyalakan (`npm run dev`), sistem akan mendeteksi skema PostgreSQL dan siap digunakan.
