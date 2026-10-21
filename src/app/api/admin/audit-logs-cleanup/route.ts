import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK if not already initialized
if (admin.apps.length === 0) {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(process.cwd(), 'service-account.json');
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } else {
    admin.initializeApp();
  }
}

async function deleteCollection(collectionPath: string, batchSize = 500): Promise<number> {
  const db = admin.firestore();
  const collectionRef = db.collection(collectionPath);
  let totalDeleted = 0;

  while (true) {
    const snapshot = await collectionRef.limit(batchSize).get();
    if (snapshot.size === 0) {
      break;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    totalDeleted += snapshot.size;

    if (snapshot.size < batchSize) {
      break;
    }
  }

  return totalDeleted;
}

export async function GET() {
  const scriptPath = path.join(process.cwd(), 'scripts', 'wipe-audit-logs.js');
  const scriptExists = fs.existsSync(scriptPath);
  return NextResponse.json({ scriptExists });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action;

    if (action === 'wipe') {
      const scriptPath = path.join(process.cwd(), 'scripts', 'wipe-audit-logs.js');
      if (!fs.existsSync(scriptPath)) {
        return NextResponse.json({ 
          success: false, 
          message: 'The wipe script has been deleted. Audit log wiping is permanently disabled.' 
        }, { status: 403 });
      }
      const count = await deleteCollection('audit_logs', 500);
      return NextResponse.json({ 
        success: true, 
        message: `Successfully wiped ${count} audit log records.` 
      });
    }

    if (action === 'delete-script') {
      const scriptPath = path.join(process.cwd(), 'scripts', 'wipe-audit-logs.js');
      if (fs.existsSync(scriptPath)) {
        fs.unlinkSync(scriptPath);
        return NextResponse.json({ 
          success: true, 
          message: 'Script (scripts/wipe-audit-logs.js) was deleted successfully.' 
        });
      } else {
        return NextResponse.json({ 
          success: false, 
          message: 'Script does not exist or has already been deleted.' 
        }, { status: 404 });
      }
    }

    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('Audit log cleanup error:', error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || 'Server error occurred during operation.' 
    }, { status: 500 });
  }
}
