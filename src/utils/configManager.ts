import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

export interface DatabaseConfig {
  active_driver: 'mongodb' | 'postgres';
  connections: {
    mongodb: string;
    postgres: string;
  };
}

const CONFIG_DIR = path.join(process.cwd(), 'config');
const CONFIG_FILE_PATH = path.join(CONFIG_DIR, 'database-config.json');

const DEFAULT_CONFIG: DatabaseConfig = {
  active_driver: 'mongodb',
  connections: {
    mongodb: 'mongodb://fachrulwisnunovianto_db_user:%40BosskuBabi2021@ac-jjfqkcv-shard-00-00.4sfcd75.mongodb.net:27017,ac-jjfqkcv-shard-00-01.4sfcd75.mongodb.net:27017,ac-jjfqkcv-shard-00-02.4sfcd75.mongodb.net:27017/emails?ssl=true&replicaSet=atlas-3mdncx-shard-0&authSource=admin&appName=Cluster0',
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
      active_driver: (parsed.active_driver === 'postgres' ? 'postgres' : 'mongodb'),
      connections: {
        mongodb: parsed.connections?.mongodb ?? '',
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
    active_driver: newConfig.active_driver === 'postgres' ? 'postgres' : (newConfig.active_driver === 'mongodb' ? 'mongodb' : current.active_driver),
    connections: {
      mongodb: newConfig.connections?.mongodb ?? current.connections.mongodb ?? '',
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

  console.log('[configManager] Database configuration updated successfully:', updated.active_driver);
  return updated;
}
