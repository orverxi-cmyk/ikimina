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
exports.getEmailConfig = getEmailConfig;
exports.createMailTransporter = createMailTransporter;
exports.generateAndSendActivationEmail = generateAndSendActivationEmail;
const admin = __importStar(require("firebase-admin"));
const nodemailer = __importStar(require("nodemailer"));
/**
 * Retrieves the system email/SMTP configuration from Firestore settings/email,
 * falling back to environment variables or safe defaults.
 */
async function getEmailConfig() {
    try {
        const db = admin.firestore();
        const snap = await db.collection('settings').doc('email').get();
        const data = snap.exists ? snap.data() : {};
        const smtpPort = Number(data.smtpPort || process.env.SMTP_PORT) || 587;
        const smtpSecure = data.smtpSecure !== undefined
            ? Boolean(data.smtpSecure)
            : (smtpPort === 465);
        return {
            smtpHost: (data.smtpHost || process.env.SMTP_HOST || '').trim(),
            smtpPort,
            smtpSecure,
            smtpUser: (data.smtpUser || process.env.SMTP_USER || '').trim(),
            smtpPass: (data.smtpPass || process.env.SMTP_PASS || '').trim(),
            fromName: (data.fromName || process.env.SMTP_FROM_NAME || 'Ikimina Scheme').trim(),
            fromEmail: (data.fromEmail || process.env.SMTP_FROM_EMAIL || data.smtpUser || process.env.SMTP_USER || 'no-reply@ikimina.rw').trim(),
            appUrl: (data.appUrl || process.env.APP_URL || 'https://studio-1670844393-18cbb.web.app').trim(),
        };
    }
    catch (e) {
        console.warn('Failed to load email config from Firestore settings/email:', e);
        return {
            smtpHost: process.env.SMTP_HOST || '',
            smtpPort: Number(process.env.SMTP_PORT) || 587,
            smtpSecure: false,
            smtpUser: process.env.SMTP_USER || '',
            smtpPass: process.env.SMTP_PASS || '',
            fromName: process.env.SMTP_FROM_NAME || 'Ikimina Scheme',
            fromEmail: process.env.SMTP_FROM_EMAIL || 'no-reply@ikimina.rw',
            appUrl: process.env.APP_URL || 'https://studio-1670844393-18cbb.web.app',
        };
    }
}
/**
 * Retrieves branding details from settings/financials
 */
async function getBrandingDetails() {
    var _a, _b;
    try {
        const db = admin.firestore();
        const snap = await db.collection('settings').doc('financials').get();
        if (snap.exists) {
            const data = snap.data();
            return {
                appName: ((_a = data.appName) === null || _a === void 0 ? void 0 : _a.trim()) || 'Ikimina App',
                infrastructureBranding: ((_b = data.infrastructureBranding) === null || _b === void 0 ? void 0 : _b.trim()) || 'Secure Infrastructure Provided by ORVEXI'
            };
        }
    }
    catch (e) {
        console.warn('Failed to fetch branding for email:', e);
    }
    return {
        appName: 'Ikimina App',
        infrastructureBranding: 'Secure Infrastructure Provided by ORVEXI'
    };
}
/**
 * Creates a Nodemailer transport instance from configuration
 */
function createMailTransporter(config) {
    if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
        return null;
    }
    return nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort || 587,
        secure: config.smtpSecure || false,
        auth: {
            user: config.smtpUser,
            pass: config.smtpPass,
        },
        tls: {
            rejectUnauthorized: false
        }
    });
}
/**
 * Generates an HTML activation email template with professional styling
 */
function buildActivationEmailHtml(params) {
    const { recipientName, appName, activationLink, infrastructureBranding } = params;
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Activate Your Account</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      background-color: #f8fafc;
      color: #1e293b;
    }
    .container {
      max-width: 600px;
      margin: 40px auto;
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0,0,0,0.06);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%);
      padding: 36px 32px;
      text-align: center;
      color: #ffffff;
    }
    .header h1 {
      margin: 0;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.5px;
    }
    .content {
      padding: 36px 32px;
      font-size: 15px;
      line-height: 1.65;
    }
    .greeting {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 16px;
      color: #0f172a;
    }
    .btn-container {
      margin: 32px 0;
      text-align: center;
    }
    .btn {
      display: inline-block;
      background: #2563eb;
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 36px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 15px;
      box-shadow: 0 4px 14px rgba(37,99,235,0.3);
    }
    .notice {
      background-color: #f1f5f9;
      border-left: 4px solid #2563eb;
      padding: 14px 16px;
      border-radius: 8px;
      margin: 24px 0;
      font-size: 13px;
      color: #475569;
    }
    .break-link {
      word-break: break-all;
      color: #2563eb;
      font-size: 12px;
    }
    .footer {
      background-color: #f8fafc;
      padding: 24px 32px;
      text-align: center;
      border-top: 1px solid #e2e8f0;
      font-size: 11px;
      color: #64748b;
    }
    .branding {
      text-transform: uppercase;
      font-weight: 800;
      letter-spacing: 1.5px;
      color: #94a3b8;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${appName}</h1>
    </div>
    <div class="content">
      <div class="greeting">Hello ${recipientName || 'Member'},</div>
      <p>
        An account has been created for you on the <strong>${appName}</strong> management platform.
      </p>
      <p>
        To activate your account, verify your email address, and set your private password, please click the button below:
      </p>
      
      <div class="btn-container">
        <a href="${activationLink}" class="btn" target="_blank">Activate My Account</a>
      </div>

      <div class="notice">
        <strong>Security Tip:</strong> This activation link is unique to your email address and can only be used once. For your security, this link will expire in 24 hours.
      </div>

      <p style="font-size: 13px; color: #64748b;">
        If the button above doesn't work, copy and paste this URL into your web browser:
      </p>
      <p class="break-link">
        <a href="${activationLink}" style="color: #2563eb;">${activationLink}</a>
      </p>

      <p style="font-size: 13px; color: #94a3b8; margin-top: 28px;">
        If you did not expect this invitation or believe it was sent by mistake, you can safely ignore this email.
      </p>
    </div>
    <div class="footer">
      <div>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</div>
      <div class="branding">${infrastructureBranding}</div>
    </div>
  </div>
</body>
</html>
    `;
}
/**
 * Generates an authoritative Firebase Auth sign-in / activation link and delivers
 * it via SMTP email. If SMTP is not yet configured, gracefully logs the link to audit_logs
 * so testing and local development remain completely functional.
 */
async function generateAndSendActivationEmail(params) {
    const { email, name = 'Member', memberDocId, requestedBy = 'system', appUrl: overrideUrl } = params;
    const normalizedEmail = email.trim().toLowerCase();
    const config = await getEmailConfig();
    const branding = await getBrandingDetails();
    const baseUrl = (overrideUrl || config.appUrl || 'https://studio-1670844393-18cbb.web.app').replace(/\/$/, '');
    const actionCodeSettings = {
        url: `${baseUrl}/login`,
        handleCodeInApp: true,
    };
    // 1. Authoritatively generate the cryptographic activation link using Firebase Admin SDK
    const activationLink = await admin.auth().generateSignInWithEmailLink(normalizedEmail, actionCodeSettings);
    const db = admin.firestore();
    let emailSent = false;
    let errorMessage = null;
    // 2. Dispatch via SMTP if configured
    const transporter = createMailTransporter(config);
    if (transporter) {
        try {
            const htmlContent = buildActivationEmailHtml({
                recipientName: name,
                appName: branding.appName,
                activationLink,
                infrastructureBranding: branding.infrastructureBranding
            });
            const fromHeader = config.fromName
                ? `"${config.fromName}" <${config.fromEmail}>`
                : config.fromEmail;
            await transporter.sendMail({
                from: fromHeader,
                to: normalizedEmail,
                subject: `Account Activation - ${branding.appName}`,
                text: `Hello ${name},\n\nPlease activate your account for ${branding.appName} by visiting:\n${activationLink}\n\nThis link is valid for 24 hours.`,
                html: htmlContent
            });
            emailSent = true;
        }
        catch (mailError) {
            console.error('Failed to dispatch activation email via SMTP:', mailError);
            errorMessage = (mailError === null || mailError === void 0 ? void 0 : mailError.message) || 'SMTP delivery failed';
        }
    }
    else {
        errorMessage = 'SMTP credentials not configured in settings/email. Activation link logged to audit_logs for verification.';
    }
    // 3. Log the operation in audit_logs for enterprise traceability
    await db.collection('audit_logs').add({
        adminId: requestedBy,
        action: 'SEND_ACTIVATION_EMAIL',
        justification: 'Dispatched member account activation link',
        details: {
            email: normalizedEmail,
            memberName: name,
            memberDocId: memberDocId || null,
            emailSent,
            smtpConfigured: !!transporter,
            error: errorMessage,
            activationLink, // preserved for administrative support and testing
        },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    // 4. Update the user document if memberDocId is provided
    if (memberDocId) {
        try {
            await db.collection('users').doc(memberDocId).update({
                lastActivationSentAt: admin.firestore.FieldValue.serverTimestamp(),
                latestActivationLink: activationLink,
            });
        }
        catch (e) {
            console.warn(`Failed to update user doc ${memberDocId} with latest activation metadata:`, e);
        }
    }
    return {
        success: true,
        emailSent,
        activationLink,
        message: emailSent
            ? `Activation email successfully sent to ${normalizedEmail}.`
            : `Activation link generated. (${errorMessage})`
    };
}
//# sourceMappingURL=email-service.js.map