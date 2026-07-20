import { MongoClient, Db } from 'mongodb';

// Password @BosskuBabi2021 is URL-encoded as %40BosskuBabi2021 to prevent connection string parsing issues.
const uri = "mongodb://fachrulwisnunovianto_db_user:%40BosskuBabi2021@ac-jjfqkcv-shard-00-00.4sfcd75.mongodb.net:27017,ac-jjfqkcv-shard-00-01.4sfcd75.mongodb.net:27017,ac-jjfqkcv-shard-00-02.4sfcd75.mongodb.net:27017/?ssl=true&replicaSet=atlas-3mdncx-shard-0&authSource=admin&appName=Cluster0";

let client: MongoClient | null = null;
let dbInstance: Db | null = null;

export async function getMongoClient(): Promise<MongoClient> {
  if (!client) {
    console.log('[MongoDB] Connecting to MongoDB Atlas...');
    client = new MongoClient(uri, {
      connectTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    });
    await client.connect();
    console.log('[MongoDB] Connected successfully to MongoDB Atlas.');
  }
  return client;
}

export async function getMongoDb(): Promise<Db> {
  if (!dbInstance) {
    const activeClient = await getMongoClient();
    // Use the default DB, or fallback to 'Cluster0' or 'emails' if not set
    dbInstance = activeClient.db('emails');
  }
  return dbInstance;
}
