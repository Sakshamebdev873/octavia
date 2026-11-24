import { MongoClient, type Db } from "mongodb";
import { retry } from "../lib/retry";

export interface MongoConnection {
  client: MongoClient;
  db: Db;
}

/** Connects to MongoDB, retrying while the server starts up. */
export async function connectMongo(url: string, dbName: string): Promise<MongoConnection> {
  const client = new MongoClient(url, { serverSelectionTimeoutMS: 2000 });
  await retry("MongoDB", async () => {
    await client.connect();
    await client.db(dbName).command({ ping: 1 });
  });
  return { client, db: client.db(dbName) };
}
