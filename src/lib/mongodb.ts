import { MongoClient, Db } from 'mongodb';

// Password @BosskuBabi2021 is URL-encoded as %40BosskuBabi2021 to prevent connection string parsing issues.
const uri = "mongodb://fachrulwisnunovianto_db_user:%40BosskuBabi2021@ac-jjfqkcv-shard-00-00.4sfcd75.mongodb.net:27017,ac-jjfqkcv-shard-00-01.4sfcd75.mongodb.net:27017,ac-jjfqkcv-shard-00-02.4sfcd75.mongodb.net:27017/?ssl=true&replicaSet=atlas-3mdncx-shard-0&authSource=admin&appName=Cluster0";

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

/**
 * Returns a cached singleton MongoClient instance.
 */
export async function getMongoClient(): Promise<MongoClient> {
  if (cachedClient) {
    return cachedClient;
  }

  console.log('[MongoDB] Connecting to MongoDB Atlas (Singleton)...');
  const client = new MongoClient(uri, {
    connectTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    minPoolSize: 2,
  });

  await client.connect();
  console.log('[MongoDB] Connected successfully to MongoDB Atlas.');
  cachedClient = client;
  return cachedClient;
}

/**
 * Returns a cached singleton Db instance using the 'Cached Connection' pattern.
 */
export async function getMongoDb(): Promise<Db> {
  if (cachedDb) {
    return cachedDb;
  }
  
  const client = await getMongoClient();
  cachedDb = client.db('emails');
  return cachedDb;
}

/**
 * Direct implementation of getDb returning the cached/connected client as per instructions.
 */
export async function getDb(): Promise<MongoClient> {
  if (cachedClient) {
    return cachedClient;
  }

  console.log('[MongoDB] Connecting to MongoDB Atlas (Cached Pattern)...');
  const client = new MongoClient(uri, {
    connectTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    minPoolSize: 2,
  });

  await client.connect();
  console.log('[MongoDB] Connected successfully.');
  cachedClient = client;
  return cachedClient;
}

// Ensure the connection is gracefully closed ONLY when the app is terminating
process.on('SIGINT', async () => {
  if (cachedClient) {
    console.log('[MongoDB] SIGINT received. Gracefully closing MongoDB connection...');
    try {
      await cachedClient.close();
    } catch (err) {
      console.error('[MongoDB] Error closing connection on SIGINT:', err);
    }
    cachedClient = null;
    cachedDb = null;
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (cachedClient) {
    console.log('[MongoDB] SIGTERM received. Gracefully closing MongoDB connection...');
    try {
      await cachedClient.close();
    } catch (err) {
      console.error('[MongoDB] Error closing connection on SIGTERM:', err);
    }
    cachedClient = null;
    cachedDb = null;
  }
  process.exit(0);
});
