"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.testEmailSettings = exports.updateEmailSettings = exports.getEmailSettings = exports.sendMemberActivationEmail = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const email_service_1 = require("./email-service");
/**
 * Sends or resends an account activation email with an authoritative Firebase sign-in link.
 * Can be called by unauthenticated users requesting an activation link from the login screen
 * (for accounts with pending status), or by administrators managing members.
 */
exports.sendMemberActivationEmail = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a, _b;
    const { email, memberId, appUrl } = request.data || {};
    const db = admin.firestore();
    let targetEmail = (email || '').trim().toLowerCase();
    let targetMemberId = memberId;
    let memberName = 'Member';
    // 1. If called by unauthenticated user (from /login)
    if (!request.auth) {
        if (!targetEmail) {
            throw new https_1.HttpsError('invalid-argument', 'Email address is required.');
        }
        // Look up member in Firestore
        const userQuery = await db.collection('users')
            .where('email', '==', targetEmail)
            .limit(1)
            .get();
        if (userQuery.empty) {
            throw new https_1.HttpsError('not-found', 'No member account found with this email address.');
        }
        const userDoc = userQuery.docs[0];
        const userData = userDoc.data();
        if (userData.status !== 'pending') {
            throw new https_1.HttpsError('failed-precondition', 'This account is already active. You can sign in with your email and password.');
        }
        targetMemberId = userDoc.id;
        memberName = userData.name || 'Member';
    }
    else {
        // Authenticated caller: check if admin or self
        const callerSnap = await db.collection('users').doc(request.auth.uid).get();
        const callerRole = (_a = callerSnap.data()) === null || _a === void 0 ? void 0 : _a.role;
        const isAdmin = callerRole === 'admin';
        if (targetMemberId) {
            const memberDoc = await db.collection('users').doc(targetMemberId).get();
            if (!memberDoc.exists) {
                throw new https_1.HttpsError('not-found', 'Member profile not found.');
            }
            const data = memberDoc.data();
            targetEmail = (data.email || '').toLowerCase();
            memberName = data.name || 'Member';
        }
        else if (targetEmail) {
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
            throw new https_1.HttpsError('invalid-argument', 'Valid email or memberId is required.');
        }
        if (!isAdmin && request.auth.uid !== targetMemberId) {
            throw new https_1.HttpsError('permission-denied', 'Only administrators can resend activation emails for other members.');
        }
    }
    try {
        const result = await (0, email_service_1.generateAndSendActivationEmail)({
            email: targetEmail,
            name: memberName,
            memberDocId: targetMemberId,
            requestedBy: ((_b = request.auth) === null || _b === void 0 ? void 0 : _b.uid) || 'self-service-login',
            appUrl
        });
        return {
            success: true,
            emailSent: result.emailSent,
            message: result.message,
            // Return link to caller for immediate copy/fallback
            activationLink: result.activationLink,
        };
    }
    catch (error) {
        console.error('Error in sendMemberActivationEmail:', error);
        throw new https_1.HttpsError('internal', error.message || 'Failed to dispatch activation email.');
    }
});
/**
 * Super Administrator / Admin Action: Retrieves current SMTP configuration.
 * Masks sensitive password.
 */
exports.getEmailSettings = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (((_a = adminSnap.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Super Administrator or Administrator privileges required.');
    }
    const config = await (0, email_service_1.getEmailConfig)();
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
exports.updateEmailSettings = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (((_a = adminSnap.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Super Administrator or Administrator privileges required.');
    }
    const { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, fromName, fromEmail, appUrl, justification } = request.data || {};
    try {
        const updateData = {
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
    }
    catch (error) {
        console.error('Error updating email settings:', error);
        throw new https_1.HttpsError('internal', error.message);
    }
});
/**
 * Super Administrator / Admin Action: Tests the SMTP connection by sending a test email.
 */
exports.testEmailSettings = (0, https_1.onCall)({ cors: true }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'Authentication required.');
    const db = admin.firestore();
    const adminSnap = await db.collection('users').doc(request.auth.uid).get();
    if (((_a = adminSnap.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Super Administrator or Administrator privileges required.');
    }
    const { targetEmail, testConfig } = request.data || {};
    const recipient = (targetEmail || ((_b = adminSnap.data()) === null || _b === void 0 ? void 0 : _b.email) || request.auth.token.email || '').trim().toLowerCase();
    if (!recipient) {
        throw new https_1.HttpsError('invalid-argument', 'Target email address is required.');
    }
    // Merge saved config with any in-memory test overrides
    const savedConfig = await (0, email_service_1.getEmailConfig)();
    const config = {
        smtpHost: ((_d = (_c = testConfig === null || testConfig === void 0 ? void 0 : testConfig.smtpHost) !== null && _c !== void 0 ? _c : savedConfig.smtpHost) !== null && _d !== void 0 ? _d : '').trim(),
        smtpPort: Number((_e = testConfig === null || testConfig === void 0 ? void 0 : testConfig.smtpPort) !== null && _e !== void 0 ? _e : savedConfig.smtpPort) || 587,
        smtpSecure: (testConfig === null || testConfig === void 0 ? void 0 : testConfig.smtpSecure) !== undefined ? Boolean(testConfig.smtpSecure) : ((_f = savedConfig.smtpSecure) !== null && _f !== void 0 ? _f : false),
        smtpUser: ((_h = (_g = testConfig === null || testConfig === void 0 ? void 0 : testConfig.smtpUser) !== null && _g !== void 0 ? _g : savedConfig.smtpUser) !== null && _h !== void 0 ? _h : '').trim(),
        smtpPass: ((testConfig === null || testConfig === void 0 ? void 0 : testConfig.smtpPass) ? testConfig.smtpPass : savedConfig.smtpPass) || '',
        fromName: ((_k = (_j = testConfig === null || testConfig === void 0 ? void 0 : testConfig.fromName) !== null && _j !== void 0 ? _j : savedConfig.fromName) !== null && _k !== void 0 ? _k : 'Ikimina Scheme').trim(),
        fromEmail: ((_p = (_o = (_m = (_l = testConfig === null || testConfig === void 0 ? void 0 : testConfig.fromEmail) !== null && _l !== void 0 ? _l : savedConfig.fromEmail) !== null && _m !== void 0 ? _m : testConfig === null || testConfig === void 0 ? void 0 : testConfig.smtpUser) !== null && _o !== void 0 ? _o : savedConfig.smtpUser) !== null && _p !== void 0 ? _p : '').trim(),
        appUrl: ((_r = (_q = testConfig === null || testConfig === void 0 ? void 0 : testConfig.appUrl) !== null && _q !== void 0 ? _q : savedConfig.appUrl) !== null && _r !== void 0 ? _r : '').trim(),
    };
    if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
        throw new https_1.HttpsError('failed-precondition', 'SMTP Host, Username, and Password must all be configured to send a test email.');
    }
    const transporter = (0, email_service_1.createMailTransporter)(config);
    if (!transporter) {
        throw new https_1.HttpsError('failed-precondition', 'Unable to initialize mail transporter with provided credentials.');
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
    }
    catch (err) {
        console.error('SMTP test failure:', err);
        throw new https_1.HttpsError('internal', `SMTP Connection Test Failed: ${err.message || err}`);
    }
});
//# sourceMappingURL=email-management.js.map