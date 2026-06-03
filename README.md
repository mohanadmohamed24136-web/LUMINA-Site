# LUMINA - Future of Fashion Architecture

LUMINA is a high-end, cyberpunk-inspired fashion platform where designers (Architects) can manifest their assets and customers can acquire them via secure neural links (Stripe).

## Deployment Instructions

### 1. Prerequisites
- Node.js installed on your server.
- MySQL Database.
- Stripe Account (for payments).
- Gmail Account (for sending automated emails).

### 2. Database Setup
1. Create a new MySQL database named `lumina_db`.
2. Run the following command to initialize the tables:
   ```bash
   node migrate_real_subscription.js
   ```

### 3. Environment Configuration
1. Rename `backend/.env.example` to `backend/.env`.
2. Fill in your credentials:
   - `DB_PASS`: Your MySQL password.
   - `EMAIL_PASS`: Your Gmail App Password.
   - `STRIPE_SECRET_KEY`: From your Stripe Dashboard.
   - `STRIPE_WEBHOOK_SECRET`: From your Stripe Webhook settings.

### 4. Installation
```bash
npm install
cd backend
npm install
```

### 5. Running the Application
To start the server:
```bash
node server.js
```
The site will be available at `http://localhost:3000`.

### 6. Production Notes
- Ensure you have a valid SSL certificate (HTTPS) for Stripe Webhooks to work correctly in production.
- Update `FRONTEND_URL` in `.env` to your actual domain name.
- Only the master admin emails specified in `backend/routes/api.js` will have access to the Admin Portal.

---
© 2026 LUMINA PROTOCOL | NEURAL FASHION NETWORK
