
/**
 * TERMINAL SCRIPT: Grant Admin Privileges
 * 
 * To run:
 * 1. Export your service account path: 
 *    export GOOGLE_APPLICATION_CREDENTIALS="./service-account.json"
 * 2. Run: npm run set-admin
 */

const fs = require('fs');
const path = require('path');
const admin = require("firebase-admin");

// Auto-detect service-account.json in the project root if environment variable is not explicitly set
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, '..', 'service-account.json');

if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = require(path.resolve(serviceAccountPath));
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
} else {
  if (admin.apps.length === 0) {
    try {
      admin.initializeApp();
    } catch (e) {
      console.error("\n❌ Service Account Key Not Found!");
      console.error("To securely provision an administrator without hardcoded backdoors:");
      console.error("1. Go to Firebase Console (https://console.firebase.google.com)");
      console.error("2. Select your project -> Project Settings -> Service accounts");
      console.error("3. Click 'Generate new private key' and save it as 'service-account.json' in this project folder.");
      console.error("4. Re-run: npm run set-admin\n");
      process.exit(1);
    }
  }
}

async function setAdmin() {
  const email = (process.argv[2] || "tharushyamagara@gmail.com").trim().toLowerCase();
  console.log(`\n🔍 Searching for user: ${email}...`);

  try {
    let user;
    try {
      user = await admin.auth().getUserByEmail(email);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        console.log(`⚠️ User ${email} does not exist in Firebase Authentication yet.`);
        console.log(`Creating user ${email}...`);
        user = await admin.auth().createUser({
          email: email,
          emailVerified: true,
          displayName: "Super Admin",
        });
        console.log(`✅ Created Auth account with UID: ${user.uid}`);
      } else {
        throw err;
      }
    }

    // 1. Set Custom Claims (for Backend & Security Rules enforcement)
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    console.log(`✅ Custom claims applied: { admin: true }`);

    // 2. Set Firestore User Document (for UI role resolution)
    await admin.firestore().collection('users').doc(user.uid).set({
      name: user.displayName || "Super Admin",
      email: email,
      role: 'admin',
      status: 'active',
      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
      activatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`✅ Firestore user profile updated with role: 'admin'`);

    // 3. Optional: Set password if provided in CLI (node scripts/set-admin.js email password)
    const newPassword = process.argv[3];
    if (newPassword) {
      await admin.auth().updateUser(user.uid, { password: newPassword });
      console.log(`🔑 Account password has been updated.`);
    }

    // 4. Generate direct sign-in / password reset link
    const resetLink = await admin.auth().generatePasswordResetLink(email);

    console.log(`\n🎉 SUCCESS: ${email} is now a Super Admin.`);
    console.log(`\n🔗 Set your password or sign in using this link:\n${resetLink}\n`);

  } catch (error) {
    console.error("\n❌ Error applying admin privileges:", error.message);
    if (error.message.includes("Could not load the default credentials")) {
      console.error("\nPlease download your 'service-account.json' from Firebase Console -> Project Settings -> Service Accounts and place it in the project root.\n");
    }
    process.exit(1);
  }
}

setAdmin().then(() => process.exit(0)).catch(() => process.exit(1));
