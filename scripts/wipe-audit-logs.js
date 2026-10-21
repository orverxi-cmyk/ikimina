const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '..', 'service-account.json');
if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(path.resolve(serviceAccountPath));
  if (admin.apps.length === 0) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
} else if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

async function deleteQueryBatch(query, resolve, reject) {
  try {
    const snapshot = await query.get();

    const batchSize = snapshot.size;
    if (batchSize === 0) {
      resolve();
      return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    process.nextTick(() => {
      deleteQueryBatch(query, resolve, reject);
    });
  } catch (err) {
    reject(err);
  }
}

async function deleteCollection(collectionPath, batchSize = 500) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve, reject);
  });
}

async function main() {
  console.log("🧹 Starting wipe of 'audit_logs' collection...");
  await deleteCollection('audit_logs', 500);
  console.log("✅ 'audit_logs' collection wiped clean successfully.");
}

main().then(() => process.exit(0)).catch(err => {
  console.error("❌ Error wiping audit_logs:", err);
  process.exit(1);
});
