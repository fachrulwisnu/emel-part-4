import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

export interface DatabaseConfig {
  active_driver: 'postgres';
  connections: {
    postgres: string;
  };
}

const CONFIG_DIR = path.join(process.cwd(), 'config');
const CONFIG_FILE_PATH = path.join(CONFIG_DIR, 'database-config.json');

const DEFAULT_CONFIG: DatabaseConfig = {
  active_driver: 'postgres',
  connections: {
    postgres: ''
  }
};

/**
 * Ensures the config directory and file exist with valid defaults
 */
async function ensureConfigFile(): Promise<DatabaseConfig> {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      await fsPromises.mkdir(CONFIG_DIR, { recursive: true });
    }

    if (!fs.existsSync(CONFIG_FILE_PATH)) {
      await fsPromises.writeFile(
        CONFIG_FILE_PATH,
        JSON.stringify(DEFAULT_CONFIG, null, 2),
        'utf-8'
      );
      return DEFAULT_CONFIG;
    }

    const content = await fsPromises.readFile(CONFIG_FILE_PATH, 'utf-8');
    if (!content.trim()) {
      return DEFAULT_CONFIG;
    }
    const parsed = JSON.parse(content);
    return {
      active_driver: 'postgres',
      connections: {
        postgres: parsed.connections?.postgres ?? ''
      }
    };
  } catch (err) {
    console.error('[configManager] Failed to read or parse database config, returning default:', err);
    return DEFAULT_CONFIG;
  }
}

/**
 * Gets the current database configuration
 */
export async function getDatabaseConfig(): Promise<DatabaseConfig> {
  return await ensureConfigFile();
}

/**
 * Updates and saves the database configuration
 */
export async function saveDatabaseConfig(
  newConfig: Partial<DatabaseConfig>
): Promise<DatabaseConfig> {
  const current = await getDatabaseConfig();
  
  const updated: DatabaseConfig = {
    active_driver: 'postgres',
    connections: {
      postgres: newConfig.connections?.postgres ?? current.connections.postgres ?? ''
    }
  };

  if (!fs.existsSync(CONFIG_DIR)) {
    await fsPromises.mkdir(CONFIG_DIR, { recursive: true });
  }

  await fsPromises.writeFile(
    CONFIG_FILE_PATH,
    JSON.stringify(updated, null, 2),
    'utf-8'
  );

  console.log('[configManager] Database configuration updated successfully: postgres');
  return updated;
}
