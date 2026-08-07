/**
 * =========================================================================
 * DATABASE SWITCHER MODULE
 * =========================================================================
 *
 * [MIGRATION NOTE]: Modul ini dulunya memfasilitasi switching antara MongoDB dan PostgreSQL.
 * Sekarang telah terkunci secara permanen pada 'postgres' untuk menegaskan migrasi penuh ke PostgreSQL.
 */

import { getDatabaseConfig, saveDatabaseConfig } from '../utils/configManager';

export type DbDriver = 'postgres' | 'mongodb';

let cachedDriver: DbDriver = 'postgres';

/**
 * Mengembalikan driver database aktif secara asinkron.
 *
 * [MIGRATION NOTE]: Menjamin ketersediaan PostgreSQL sebagai satu-satunya RDBMS terpusat.
 *
 * @returns {Promise<DbDriver>} Mengembalikan string 'postgres'.
 */
export async function getDbDriverAsync(): Promise<DbDriver> {
  const config = await getDatabaseConfig();
  cachedDriver = 'postgres';
  return 'postgres';
}

/**
 * Mengembalikan driver database aktif secara sinkron.
 *
 * @returns {DbDriver} Mengembalikan string 'postgres'.
 */
export function getDbDriver(): DbDriver {
  return 'postgres';
}

/**
 * Mengatur driver database aktif ke PostgreSQL.
 *
 * [MIGRATION NOTE]: Menonaktifkan pengalihan ke MongoDB dan memastikannya terkunci pada PostgreSQL.
 *
 * @param {DbDriver} [driver='postgres'] - Nama driver database.
 * @returns {Promise<void>}
 */
export async function switchDatabase(driver: DbDriver = 'postgres'): Promise<void> {
  console.log(`[dbSwitcher] Database driver set to: postgres`);
  cachedDriver = 'postgres';
  await saveDatabaseConfig({ active_driver: 'postgres' });
}

