import { MongoClient, ServerApiVersion } from 'mongodb';

const DEFAULT_URI = 'mongodb+srv://admin:<db_password>@wt.hzdsy0y.mongodb.net/?appName=WT';
const DEFAULT_DB_NAME = 'http_client_app';

let client = null;
let db = null;
let connected = false;
let lastError = null;
let connectingPromise = null;

const hasPasswordPlaceholder = (uri) => uri.includes('<db_password>');

export const getMongoConfig = () => ({
  uri: process.env.MONGODB_URI || DEFAULT_URI,
  dbName: process.env.MONGODB_DB_NAME || DEFAULT_DB_NAME,
});

export const connectMongo = async () => {
  const { uri, dbName } = getMongoConfig();

  if (hasPasswordPlaceholder(uri)) {
    lastError = 'MONGODB_URI contains <db_password>. Please replace it with your Atlas user password.';
    connected = false;
    return null;
  }

  try {
    if (connected && db) {
      return db;
    }
    if (connectingPromise) {
      return await connectingPromise;
    }

    connectingPromise = (async () => {
      if (client) {
        try {
          await client.close();
        } catch (closeError) {
          // ignore stale client close errors
        }
      }

      client = new MongoClient(uri, {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true,
        },
      });

      await client.connect();
      db = client.db(dbName);
      await db.command({ ping: 1 });

      connected = true;
      lastError = null;
      return db;
    })();

    return await connectingPromise;
  } catch (error) {
    connected = false;
    lastError = error instanceof Error ? error.message : String(error);
    db = null;
    return null;
  } finally {
    connectingPromise = null;
  }
};

export const getDb = () => db;

export const getMongoState = () => {
  const { dbName } = getMongoConfig();
  return {
    connected,
    dbName,
    lastError,
  };
};

export const disconnectMongo = async () => {
  if (client) {
    await client.close();
  }
  client = null;
  db = null;
  connected = false;
};
