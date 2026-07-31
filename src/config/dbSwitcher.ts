import { getDatabaseConfig, saveDatabaseConfig, DatabaseConfig } from '../utils/configManager';

export type DbDriver = 'mongodb' | 'postgres';

let cachedDriver: DbDriver = 'mongodb';

/**
 * Returns active driver synchronously or asynchronously
 */
export async function getDbDriverAsync(): Promise<DbDriver> {
  const config = await getDatabaseConfig();
  cachedDriver = config.active_driver;
  return config.active_driver;
}

/**
 * Legacy sync getter returning cached active driver
 */
export function getDbDriver(): DbDriver {
  return cachedDriver;
}

/**
 * Switches the active database driver in the JSON config file
 */
export async function switchDatabase(driver: DbDriver): Promise<void> {
  console.log(`[dbSwitcher] Switching database driver to: ${driver}`);
  cachedDriver = driver;
  await saveDatabaseConfig({ active_driver: driver });
}
