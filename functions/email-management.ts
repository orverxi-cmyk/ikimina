import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { 
    getEmailConfig, 
    generateAndSendActivationEmail, 
    createMailTransporter, 
    type EmailConfig 
} from './email-service';

/**
 * Sends or resends an account activation email with an authoritative Firebase sign-in link.
 * Can be called by unauthenticated users requesting an activation link from the login screen
 * (for accounts with pending status), or by administrators managing members.
 */
export const sendMemberActivationEmail = onCall({ cors: true }, async (request) => {
    const { email, memberId, appUrl } = request.data || {};
    const db = admin.firestore();

    let targetEmail = (email || '').trim().toLowerCase();
    let targetMemberId = memberId;
    let memberName = 'Member';

    // 1. If called by unauthenticated user (from /login)
    if (!request.auth) {
        if (!targetEmail) {
            throw new HttpsError('invalid-argument', 'Email address is required.');
        }

        // Look up member in Firestore
        const userQuery = await db.collection('users')
            .where('email', '==', targetEmail)
            .limit(1)
            .get();

        if (userQuery.empty) {
            throw new HttpsError('not-found', 'No member account found with this email address.');
        }

        const userDoc = userQuery.docs[0];
        const userData = userDoc.data();

        if (userData.status !== 'pending') {
            throw new HttpsError('failed-precondition', 'This account is already active. You can sign in with your email and password.');
        }

        targetMemberId = userDoc.id;
        memberName = userData.name || 'Member';
    } else {
        // Authenticated caller: check if admin or self
        const callerSnap = await db.collection('users').doc(request.auth.uid).get();
        const callerRole = callerSnap.data()?.role;
        const isAdmin = callerRole === 'admin';

        if (targetMemberId) {
            const memberDoc = await db.collection('users').doc(targetMemberId).get();
            if (!memberDoc.exists) {
                throw new HttpsError('not-found', 'Member profile not found.');
            }
            const data = memberDoc.data()!;
            targetEmail = (data.email || '').toLowerCase();
            memberName = data.name || 'Member';
        } else if (targetEmail) {
            const userQuery = await db.collection('users')
                .where('email', '==', targetEmail)
                .limit(1)
                .get();

            if (!userQuery.empty) {
                targetMemberId = userQuery.docs[0].id;
                memberName = userQuery.docs[0].data().name || 'Member';
            }
        }

        if (!targetEmail) {
            throw new HttpsError('invalid-argument', 'Valid email or memberId is required.');
        }

        if (!isAdmin && request.auth.uid !== targetMemberId) {
            throw new HttpsError('permission-denied', 'Only administrators can resend activation emails for other members.');
        }
    }

    try {
        const result = await generateAndSendActivationEmail({
            email: targetEmail,
            name: memberName,
            memberDocId: targetMemberId,
            requestedBy: request.auth?.uid || 'self-service-login',
            appUrl
        });

        return {
            success: true,
            emailSent: result.emailSent,
            message: result.message,
            // Return link to caller for immediate copy/fallback
            activationLink: result.activationLink,
        };
    } catch (error: any) {
        console.error('Error in sendMemberActivationEmail:', error);
        throw new HttpsError('internal', error.message || 'Failed to dispatch activation email.');
    }
});

/**
 * Super Administrator / Admin Action: Retrieves current SMTP configuration.
 * Masks sensitive password.
 */
export const getEmailSettings = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (adminSnap.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Super Administrator or Administrator privileges required.');
    }

    const config = await getEmailConfig();

    return {
        smtpHost: config.smtpHost || '',
        smtpPort: config.smtpPort || 587,
        smtpSecure: config.smtpSecure || false,
        smtpUser: config.smtpUser || '',
        hasPassword: !!config.smtpPass,
        fromName: config.fromName || 'Ikimina Scheme',
        fromEmail: config.fromEmail || '',
        appUrl: config.appUrl || '',
        isConfigured: !!(config.smtpHost && config.smtpUser && config.smtpPass)
    };
});

/**
 * Super Administrator / Admin Action: Updates system SMTP email configuration.
 */
export const updateEmailSettings = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (adminSnap.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Super Administrator or Administrator privileges required.');
    }

    const { 
        smtpHost, 
        smtpPort, 
        smtpSecure, 
        smtpUser, 
        smtpPass, 
        fromName, 
        fromEmail, 
        appUrl,
        justification 
    } = request.data || {};

    try {
        const updateData: Record<string, any> = {
            smtpHost: (smtpHost || '').trim(),
            smtpPort: Number(smtpPort) || 587,
            smtpSecure: Boolean(smtpSecure),
            smtpUser: (smtpUser || '').trim(),
            fromName: (fromName || 'Ikimina Scheme').trim(),
            fromEmail: (fromEmail || smtpUser || '').trim(),
            appUrl: (appUrl || '').trim(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: request.auth.uid,
        };

        // Only update password if provided
        if (typeof smtpPass === 'string' && smtpPass.trim().length > 0) {
            updateData.smtpPass = smtpPass.trim();
        }

        await db.collection('settings').doc('email').set(updateData, { merge: true });

        // Record audit trail
        await db.collection('audit_logs').add({
            adminId: request.auth.uid,
            action: 'UPDATE_EMAIL_SETTINGS',
            justification: justification || 'Configured system SMTP email delivery settings',
            details: {
                smtpHost: updateData.smtpHost,
                smtpPort: updateData.smtpPort,
                smtpSecure: updateData.smtpSecure,
                smtpUser: updateData.smtpUser,
                fromEmail: updateData.fromEmail,
                hasPasswordUpdated: typeof smtpPass === 'string' && smtpPass.trim().length > 0
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true };
    } catch (error: any) {
        console.error('Error updating email settings:', error);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Super Administrator / Admin Action: Tests the SMTP connection by sending a test email.
 */
export const testEmailSettings = onCall({ cors: true }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required.');

    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (adminSnap.data()?.role !== 'admin') {
        throw new HttpsError('permission-denied', 'Super Administrator or Administrator privileges required.');
    }

    const { targetEmail, testConfig } = request.data || {};
    const recipient = (targetEmail || adminSnap.data()?.email || request.auth.token.email || '').trim().toLowerCase();

    if (!recipient) {
        throw new HttpsError('invalid-argument', 'Target email address is required.');
    }

    // Merge saved config with any in-memory test overrides
    const savedConfig = await getEmailConfig();
    const config: EmailConfig = {
        smtpHost: (testConfig?.smtpHost ?? savedConfig.smtpHost ?? '').trim(),
        smtpPort: Number(testConfig?.smtpPort ?? savedConfig.smtpPort) || 587,
        smtpSecure: testConfig?.smtpSecure !== undefined ? Boolean(testConfig.smtpSecure) : (savedConfig.smtpSecure ?? false),
        smtpUser: (testConfig?.smtpUser ?? savedConfig.smtpUser ?? '').trim(),
        smtpPass: (testConfig?.smtpPass ? testConfig.smtpPass : savedConfig.smtpPass) || '',
        fromName: (testConfig?.fromName ?? savedConfig.fromName ?? 'Ikimina Scheme').trim(),
        fromEmail: (testConfig?.fromEmail ?? savedConfig.fromEmail ?? testConfig?.smtpUser ?? savedConfig.smtpUser ?? '').trim(),
        appUrl: (testConfig?.appUrl ?? savedConfig.appUrl ?? '').trim(),
    };

    if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
        throw new HttpsError('failed-precondition', 'SMTP Host, Username, and Password must all be configured to send a test email.');
    }

    const transporter = createMailTransporter(config);
    if (!transporter) {
        throw new HttpsError('failed-precondition', 'Unable to initialize mail transporter with provided credentials.');
    }

    try {
        // 1. Verify connection
        await transporter.verify();

        // 2. Send actual test email
        const info = await transporter.sendMail({
            from: config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail,
            to: recipient,
            subject: 'Test Email - Ikimina Email Delivery System',
            text: `This is a test email sent from your Ikimina management platform.\n\nSMTP Host: ${config.smtpHost}\nPort: ${config.smtpPort}\nSSL/TLS: ${config.smtpSecure ? 'Enabled' : 'Disabled'}\n\nIf you received this email, your outbound email delivery infrastructure is configured and working properly!`,
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 500px; margin: 20px auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
                    <h2 style="color: #2563eb; margin-top: 0;">Connection Successful!</h2>
                    <p style="color: #334155; font-size: 14px; line-height: 1.6;">
                        This is a test email sent from your <strong>Ikimina</strong> platform. Your email delivery infrastructure is active and properly authenticated.
                    </p>
                    <div style="background: #f8fafc; border-radius: 8px; padding: 12px 16px; margin: 16px 0; font-size: 13px; color: #475569;">
                        <div><strong>SMTP Host:</strong> ${config.smtpHost}</div>
                        <div><strong>Port:</strong> ${config.smtpPort}</div>
                        <div><strong>SSL/TLS:</strong> ${config.smtpSecure ? 'Yes (SSL)' : 'No (STARTTLS)'}</div>
                        <div><strong>Sender:</strong> ${config.fromEmail}</div>
                    </div>
                    <p style="color: #94a3b8; font-size: 11px; margin-bottom: 0;">
                        Secure Infrastructure Provided by ORVEXI
                    </p>
                </div>
            `
        });

        return {
            success: true,
            message: `Test email successfully delivered to ${recipient}. (Message ID: ${info.messageId})`
        };
    } catch (err: any) {
        console.error('SMTP test failure:', err);
        throw new HttpsError('internal', `SMTP Connection Test Failed: ${err.message || err}`);
    }
});
