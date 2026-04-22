const { MongoClient } = require('mongodb');

const uri = "mongodb+srv://riekgamer221206_db_user:N7t6pmAOBs1J27uQ@cluster0.wv4x1dn.mongodb.net/?appName=Cluster0";
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    const db = client.db('solmates');
    const collection = db.collection('solmates_db');
    
    console.log("Connected to MongoDB Atlas!");
    
    const result = await collection.updateOne(
      { _id: 'main' },
      { $set: { sol_deleted_notifications: [], sol_deleted_live_classes: [] } }
    );
    
    console.log(`Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);
    console.log("Blacklist successfully cleared!");
  } finally {
    await client.close();
  }
}

run().catch(console.dir);
