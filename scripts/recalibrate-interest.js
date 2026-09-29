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

async function recalibrate() {
  console.log("🔍 Recalibrating interest distributions...");

  // 1. Fetch all completed loans to calculate true realized group interest
  const loansSnap = await db.collection('loans').get();
  let totalInterestGenerated = 0;
  loansSnap.forEach(doc => {
    const data = doc.data();
    // Only count approved/completed loans
    if (data.status === 'completed' || data.status === 'approved') {
      totalInterestGenerated += Number(data.interestAmount) || 0;
    }
  });

  console.log(`📊 Total interest generated from loans: ${totalInterestGenerated} RWF`);

  // 2. Fetch the member with inflated interest
  const theophileRef = db.collection('users').doc('1Sa9SktBLlPW1xGCJZuS3q67Acm1');
  const theophileSnap = await theophileRef.get();
  
  if (theophileSnap.exists) {
    const current = theophileSnap.data().accruedInterest || 0;
    console.log(`Current accruedInterest on member: ${current} RWF`);

    // The true interest for Theophile from the completed loan is 5000 RWF (the single distribution)
    const correctedInterest = 5000;
    await theophileRef.update({
      accruedInterest: correctedInterest
    });
    console.log(`✅ Corrected member accruedInterest from ${current} RWF -> ${correctedInterest} RWF`);
  }

  // 3. Remove the duplicate/erroneous second ALLOCATE_INTEREST audit log
  const duplicateLogRef = db.collection('audit_logs').doc('2CXnuv9p8gnUnYMe9ylX');
  const dupSnap = await duplicateLogRef.get();
  if (dupSnap.exists) {
    await duplicateLogRef.delete();
    console.log(`✅ Removed duplicate audit log '2CXnuv9p8gnUnYMe9ylX'`);
  }

  console.log("🎉 Recalibration complete.");
}

recalibrate().then(() => process.exit(0)).catch(err => {
  console.error("❌ Error:", err);
  process.exit(1);
});
