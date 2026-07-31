import { MongoClient, Db } from 'mongodb';

const DEFAULT_URI = "mongodb://fachrulwisnunovianto_db_user:%40BosskuBabi2021@ac-jjfqkcv-shard-00-00.4sfcd75.mongodb.net:27017,ac-jjfqkcv-shard-00-01.4sfcd75.mongodb.net:27017,ac-jjfqkcv-shard-00-02.4sfcd75.mongodb.net:27017/emails?ssl=true&replicaSet=atlas-3mdncx-shard-0&authSource=admin&appName=Cluster0";

let client: MongoClient | null = null;
let connectPromise: Promise<MongoClient> | null = null;
let cachedDb: Db | null = null;
let currentUri: string | null = null;

/**
 * Closes MongoDB connection if active
 */
export async function closeMongoConnection(): Promise<void> {
  if (client) {
    console.log('[MongoDB] Closing active MongoDB connection...');
    try {
      await client.close();
    } catch (err) {
      console.error('[MongoDB] Error closing connection:', err);
    }
    client = null;
    connectPromise = null;
    cachedDb = null;
    currentUri = null;
  }
}

/**
 * Returns a MongoClient instance for the specified URI.
 */
export async function getMongoClient(overrideUri?: string): Promise<MongoClient> {
  const connectionUri = overrideUri || DEFAULT_URI;

  if (client && currentUri === connectionUri) {
    return client;
  }

  if (client && currentUri !== connectionUri) {
    await closeMongoConnection();
  }

  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = (async () => {
    console.log('[MongoDB] Connecting to MongoDB Cluster...');
    const newClient = new MongoClient(connectionUri, {
      connectTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 2,
    });
    await newClient.connect();
    console.log('[MongoDB] Connected successfully to MongoDB.');
    client = newClient;
    currentUri = connectionUri;
    return client;
  })();

  try {
    const connectedClient = await connectPromise;
    return connectedClient;
  } catch (err) {
    connectPromise = null;
    currentUri = null;
    throw err;
  }
}

/**
 * Returns a cached Db instance using the 'Cached Connection' pattern.
 */
export async function getMongoDb(overrideUri?: string): Promise<Db> {
  const connectionUri = overrideUri || DEFAULT_URI;

  if (cachedDb && currentUri === connectionUri) {
    return cachedDb;
  }
  
  const connectedClient = await getMongoClient(connectionUri);
  cachedDb = connectedClient.db('emails');
  return cachedDb;
}

process.on('SIGINT', async () => {
  await closeMongoConnection();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closeMongoConnection();
  process.exit(0);
});
