import fs from 'fs';
import path from 'path';

export type DbDriver = 'supabase' | 'mongodb';

// Default runtime state
let currentDriver: DbDriver = (process.env.DB_DRIVER as DbDriver) || 'supabase';

const SETTINGS_FILE_PATH = path.join(process.cwd(), 'app_settings.json');
const ENV_FILE_PATH = path.join(process.cwd(), '.env');

/**
 * Reads the active database driver from the environment variable, runtime state, or app settings.
 */
export function getDbDriver(): DbDriver {
  // If app_settings.json has an explicit driver choice, respect it
  try {
    if (fs.existsSync(SETTINGS_FILE_PATH)) {
      const settingsContent = fs.readFileSync(SETTINGS_FILE_PATH, 'utf-8');
      const settings = JSON.parse(settingsContent);
      if (settings.dbDriver === 'supabase' || settings.dbDriver === 'mongodb') {
        currentDriver = settings.dbDriver;
      }
    }
  } catch (err) {
    console.error('[dbSwitcher] Error reading driver from app_settings.json:', err);
  }

  // Fallback to process.env if not set in runtime memory
  if (!currentDriver) {
    const envDriver = process.env.DB_DRIVER;
    if (envDriver === 'supabase' || envDriver === 'mongodb') {
      currentDriver = envDriver;
    } else {
      currentDriver = 'supabase'; // Default fallback
    }
  }

  return currentDriver;
}

/**
 * Switches the active database driver in runtime memory, app settings, and updates the .env file.
 */
export function switchDatabase(driver: DbDriver): void {
  console.log(`[dbSwitcher] Switching database driver to: ${driver}`);
  currentDriver = driver;

  // 1. Update app_settings.json
  try {
    let settings: any = {};
    if (fs.existsSync(SETTINGS_FILE_PATH)) {
      const data = fs.readFileSync(SETTINGS_FILE_PATH, 'utf-8');
      settings = JSON.parse(data);
    }
    settings.dbDriver = driver;
    fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(settings, null, 2), 'utf-8');
    console.log('[dbSwitcher] Saved to app_settings.json successfully.');
  } catch (err) {
    console.error('[dbSwitcher] Failed to write to app_settings.json:', err);
  }

  // 2. Set environment variable in running process
  process.env.DB_DRIVER = driver;

  // 3. Persist into .env file
  try {
    if (fs.existsSync(ENV_FILE_PATH)) {
      let envContent = fs.readFileSync(ENV_FILE_PATH, 'utf-8');
      const driverRegex = /^DB_DRIVER=.*$/m;

      if (driverRegex.test(envContent)) {
        // Replace existing DB_DRIVER
        envContent = envContent.replace(driverRegex, `DB_DRIVER=${driver}`);
      } else {
        // Append to file
        envContent += `\nDB_DRIVER=${driver}`;
      }
      fs.writeFileSync(ENV_FILE_PATH, envContent.trim() + '\n', 'utf-8');
      console.log('[dbSwitcher] Updated .env file successfully.');
    } else {
      // Create new .env file with driver
      fs.writeFileSync(ENV_FILE_PATH, `DB_DRIVER=${driver}\n`, 'utf-8');
      console.log('[dbSwitcher] Created new .env file with DB_DRIVER.');
    }
  } catch (err) {
    console.error('[dbSwitcher] Failed to update .env file:', err);
  }
}
