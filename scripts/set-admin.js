
/**
 * TERMINAL SCRIPT: Grant Admin Privileges
 * 
 * To run:
 * 1. Export your service account path: 
 *    export GOOGLE_APPLICATION_CREDENTIALS="./service-account.json"
 * 2. Run: npm run set-admin
 */

const admin = require("firebase-admin");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

async function setAdmin() {
  const email = "orverxi@loprok.com"; // Replace with your email
  try {
    const user = await admin.auth().getUserByEmail(email);
    
    // 1. Set Custom Claims (for Auth Security)
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    
    // 2. Update Firestore Doc (for UI & Rules)
    await admin.firestore().collection('users').doc(user.uid).set({
        name: "Super Admin",
        email: email,
        role: 'admin',
        status: 'active',
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
        activatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // 3. Set the bootstrap flag to close the UI backdoor
    await admin.firestore().collection('settings').doc('bootstrap').set({
        initialized: true,
        initializedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Success! Admin privileges applied to ${email}.`);
    console.log("👉 IMPORTANT: Sign out and sign back in on the web app.");

  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

setAdmin().then(() => process.exit(0)).catch(() => process.exit(1));
