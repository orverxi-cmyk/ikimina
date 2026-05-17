
# Ikimina App

This is a professional financial management platform for SCDT Tontine contributions and loans.

## Getting Started

1. **Bootstrap Admin**: Run the registration at `/setup-admin` or use the terminal script `npm run set-admin` (requires service account credentials).
2. **Development**: Run `npm run dev` to start the local server.
3. **AI Development**: Run `npm run genkit:dev` to explore and test Genkit flows.

## Deployment

The Ikimina App is designed to be deployed using **Firebase App Hosting**. 

- **No Standalone Functions**: This app does not use the `firebase-functions` SDK. All backend logic, including Genkit AI flows, is implemented as **Next.js Server Actions**.
- **Automatic Deployment**: When you push to your connected GitHub repository, Firebase App Hosting automatically builds and deploys your Next.js application, including all Server Actions.

### Ensuring Email Delivery Success

To ensure high delivery rates and "success" for the Authentication activation links:
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Navigate to **Authentication** > **Settings** > **Email Templates**.
3. Click the edit icon for **Email address verification**.
4. Configure a **Custom SMTP server** (e.g., via SendGrid, Mailgun, or your own mail server). This ensures emails are sent from your authorized business domain rather than a generic Firebase one.
