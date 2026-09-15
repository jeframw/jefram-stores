# Authentication Setup Guide

## Overview

Jefram Stores supports three authentication methods for customers:

1. **Phone + OTP** — Enter your phone number, receive a 6-digit code via SMS, enter it to log in or register.
2. **Google Sign-In** — Use your Google account to sign in.
3. **Apple Sign-In** — Use your Apple ID to sign in.

---

## Quick Start (No Configuration Needed)

If you don't configure Yoola SMS, Google, or Apple, the server still runs. Phone OTP will log codes to the console instead of sending real SMS. Google and Apple login buttons will show a "not configured" message.

---

## 1. Phone + OTP Authentication (SMS)

### How it works
1. Customer enters phone number → server generates a 6-digit OTP and sends it via SMS
2. Customer enters the OTP → server verifies and logs the customer in (creates account if new)

### Configure Yoola SMS (optional, recommended for production)

Sign up at https://yoola.co.ug and get:
- **YOOLA_API_KEY**: Your Yoola API key
- **YOOLA_SENDER_ID**: Your registered sender name (e.g., `Jefram store`)

Add to `.env`:
```
YOOLA_API_KEY=your_yoola_api_key
YOOLA_SENDER_ID=Jefram store
```

**Without Yoola**: OTP codes are printed to the server console instead of being sent as SMS.

### Testing without Yoola
1. Start the server
2. Open the login modal, switch to "Phone" tab
3. Enter a phone number, click "Send OTP"
4. Check the server console for the OTP code
5. Enter the code in the OTP modal

---

## 2. Google Sign-In

### How it works
1. Customer clicks "Continue with Google"
2. Google OAuth popup appears
3. Server verifies the Google ID token
4. Customer is logged in (account created if new, linked by email)

### Configure Google OAuth

1. Go to https://console.cloud.google.com/
2. Create a new project or select existing
3. Enable **Google+ API** / **People API**
4. Go to **APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Add authorized redirect URI: `http://localhost:3000` (or your domain)
7. Copy the **Client ID**

Add to `.env`:
```
GOOGLE_CLIENT_ID=your_google_client_id
```

### Google Cloud Setup Details
- In the OAuth consent screen, set the app name to "Jefram Stores"
- Add `http://localhost:3000` as an authorized origin (for development)
- For production, add your actual domain

---

## 3. Apple Sign-In

### How it works
1. Customer clicks "Continue with Apple"
2. Apple Sign-In popup appears
3. Server verifies the Apple identity token
4. Customer is logged in (account created if new, linked by email)

### Configure Apple Sign-In

1. Go to https://developer.apple.com/account
2. Navigate to **Certificates, Identifiers & Profiles → Identifiers**
3. Register a new **Service ID** (e.g., `com.jefram.stores.auth`)
4. Enable **Sign in with Apple** for that Service ID
5. Go to **Keys** → Create a new key
6. Check **Sign in with Apple**, give it a name, download the `.p8` key file
7. Copy:
   - **Key ID** (e.g., `AB12CD34EF`)
   - **Team ID** (from Apple Developer account membership page)

Add to `.env`:
```
APPLE_SERVICE_ID=your_service_id
APPLE_CLIENT_ID=com.jefram.stores
APPLE_KEY_ID=AB12CD34EF
APPLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...\n-----END PRIVATE KEY-----
```

### Converting Apple Private Key to Environment Variable

If you have the `.p8` file, convert it to a single-line string:

```bash
# On Linux/Mac:
APPLE_PRIVATE_KEY=$(cat AuthKey_XXX.p8)

# On Windows PowerShell:
$key = Get-Content "AuthKey_XXX.p8" -Raw
```

### Important Apple Notes
- Apple requires a **redirect URI** for web Sign-In: `http://localhost:3000/` (for development)
- The `APPLE_CLIENT_ID` should match the identifier you registered (e.g., `com.jefram.stores`)
- For production, use HTTPS for all redirect URIs

---

## Environment Variables Summary

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_HOST` | Yes | PostgreSQL host |
| `DB_PORT` | Yes | PostgreSQL port (default: 5432) |
| `DB_NAME` | Yes | Database name |
| `DB_USER` | Yes | Database user |
| `DB_PASSWORD` | Yes | Database password |
| `JWT_SECRET` | Yes | Secret key for JWT tokens (min 32 chars) |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | Environment (development/production) |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `YOOLA_API_KEY` | No | Yoola SMS API key |
| `YOOLA_SENDER_ID` | No | Yoola SMS sender name |
| `APPLE_SERVICE_ID` | No | Apple Service ID |
| `APPLE_CLIENT_ID` | No | Apple client ID |
| `APPLE_KEY_ID` | No | Apple key ID |
| `APPLE_PRIVATE_KEY` | No | Apple private key |

---

## API Endpoints

### Phone Authentication
- `POST /api/auth/customer/send-otp` — Send 6-digit OTP to phone number
- `POST /api/auth/customer/verify-otp` — Verify OTP and login/register
- `POST /api/auth/customer/phone-register` — Register with phone + OTP + name

### Social Authentication
- `POST /api/auth/google` — Login with Google ID token
- `POST /api/auth/apple` — Login with Apple identity token

### Auth Config
- `GET /api/auth/config` — Check which auth methods are enabled

### Existing Auth
- `POST /api/auth/customer/login` — Email + password login
- `POST /api/auth/customer/register` — Email + password registration
- `POST /api/auth/admin/login` — Admin email + password login
- `POST /api/auth/product-manager/login` — Product manager email + password login

---

## Login Flow Summary

### Customer Login Options
1. **Email + Password** → Enter email and password → JWT token returned
2. **Phone + OTP** → Enter phone → Get SMS code → Enter code → JWT token returned
3. **Google** → Click Google button → OAuth flow → JWT token returned
4. **Apple** → Click Apple button → OAuth flow → JWT token returned

### What happens on first login
- **Phone**: Account auto-created with phone number and name "Customer"
- **Google**: Account auto-created using Google profile (name, email, picture)
- **Apple**: Account auto-created using Apple profile (name, email)
- If a social account's email matches an existing account, they are linked automatically
