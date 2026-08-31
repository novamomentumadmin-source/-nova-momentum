# Host Nova Momentum for real clients

Do not use Netlify for this version. Use Render + a Postgres database.

## Recommended start (can be $0)

1. Create a free Postgres database at https://neon.tech
   - New project → copy the Connection string (DATABASE_URL)

2. Create a free web service at https://render.com
   - New → Web Service
   - Upload this folder (or connect GitHub)
   - Build command: npm install
   - Start command: npm start

3. In Render → Environment, add:
   - DATABASE_URL = (paste Neon connection string)
   - JWT_SECRET = (long random sentence)
   - ADMIN_EMAIL = novamomentum.admin@gmail.com
   - ADMIN_PASSWORD = (your admin password)
   - USDT_WALLET = (your real USDT TRC20 address)
   - USDT_NETWORK = TRC20

4. Deploy. Share the Render URL.

5. Later buy a domain and attach it in Render → Custom Domains.

## Free vs paid

Free Render + free Neon:
- Real accounts that do not wipe when the site restarts
- Site may sleep; first visit can take 20-50 seconds
- Fine for the first clients if you accept the wait

Paid Render (about $7/month) when you have paying clients:
- Site stays awake
- Feels like a normal company site

Domain: about $10-15 per year.

## Before you send the link
- Set USDT_WALLET to your real address
- Log in at /nm-admin-secure-login.html and confirm admin works
- Create a test client account from another browser/phone and approve a test deposit
