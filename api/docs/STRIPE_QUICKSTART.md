# Stripe Billing - Quick Start Guide

## ⚡ Quick Setup (5 minutes)

### Step 1: Create Stripe Products (2 min)

Go to [Stripe Dashboard > Products](https://dashboard.stripe.com/test/products):

**Product 1: Base Plan**
1. Click "+ Add product"
2. Name: `Base Plan`
3. Price: `$399.00 USD` (new signups)
4. Billing period: `Monthly`
5. Click "Add product"
6. **Copy the Price ID** (starts with `price_`)

**Product 2: Additional Account**
1. Click "+ Add product"
2. Name: `Additional Account`
3. Price: `$45.00 USD`
4. Billing period: `Monthly`
5. Click "Add product"
6. **Copy the Price ID** (starts with `price_`)

> Existing customers grandfathered at $199/month should keep their current Stripe price active and list it in `STRIPE_PRICE_ID_BASE_LEGACY` (comma-separated if you have multiple legacy prices).

### Step 2: Set Environment Variables (1 min)

**Backend** - Add to `./.devcontainer/dev.env`:

```bash
STRIPE_SECRET_KEY=sk_test_51...
STRIPE_PUBLISHABLE_KEY=pk_test_51...
STRIPE_WEBHOOK_SECRET=whsec_test_... # Get from Step 3
STRIPE_PRICE_ID_BASE=price_1... # From Product 1
STRIPE_PRICE_ID_BASE_LEGACY=price_legacy_199 # Optional: comma-separated legacy base plan price IDs
STRIPE_PRICE_ID_ADDITIONAL_ACCOUNT=price_1... # From Product 2
```

**Frontend** - Create `../radiant-front/.env`:

```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_51...
```

### Step 3: Set Up Webhooks (2 min)

**Option A: Production**
1. Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/test/webhooks)
2. Click "+ Add endpoint"
3. Endpoint URL: `https://your-domain.com/api/webhooks/stripe`
4. Select events:
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `setup_intent.succeeded`
5. Click "Add endpoint"
6. **Copy signing secret** → `STRIPE_WEBHOOK_SECRET`

**Option B: Local Testing with Stripe CLI**
```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:4000/api/webhooks/stripe

# Copy the webhook secret (whsec_...) to STRIPE_WEBHOOK_SECRET
```

### Step 4: Test! (30 seconds)

1. Start backend: `npm run dev`
2. Start frontend: `npm run dev`
3. Go to `http://localhost:5173`
4. Login or register
5. Navigate to Settings > Billing
6. Click "Set Up Billing"
7. Enter email
8. Use test card: `4242 4242 4242 4242`, any future date, any CVC
9. Complete setup
10. Go to Accounts and connect an email account ✅

## 🎯 Where to Find Your Stripe Keys

### API Keys
[Dashboard > Developers > API Keys](https://dashboard.stripe.com/test/apikeys)

- **Publishable key**: Starts with `pk_test_` (safe to use in frontend)
- **Secret key**: Starts with `sk_test_` (keep secret, backend only)

### Webhook Secret
[Dashboard > Developers > Webhooks](https://dashboard.stripe.com/test/webhooks)

- Click your endpoint
- Click "Reveal" in signing secret section
- Starts with `whsec_`

### Price IDs
[Dashboard > Products](https://dashboard.stripe.com/test/products)

- Click your product
- Find "Pricing" section
- Click the price
- Copy the ID (starts with `price_`)

## 🧪 Test Cards

```
Success:                4242 4242 4242 4242
Decline:                4000 0000 0000 0002
Requires Auth (3DS):    4000 0025 0000 3155
Insufficient funds:     4000 0000 0000 9995
```

Use any:
- Future expiry date (e.g., 12/34)
- CVC (e.g., 123)
- ZIP code (e.g., 12345)

**3D Secure (3DS) Authentication:**
When using the `4000 0025 0000 3155` test card, Stripe will require additional authentication. The subscription is created with an `incomplete` status, and your frontend will receive a `clientSecret` in the response. Your frontend should:

1. Use `stripe.confirmCardPayment(clientSecret)` to trigger the 3DS authentication modal
2. Once the user completes authentication, the subscription status will update to `active` via webhook
3. The `invoice.payment_succeeded` webhook will fire to confirm the payment

This flow simulates real-world scenarios where banks require additional verification for security.

## ⚠️ Important Notes

1. **Webhook Secret** - Different for Dashboard endpoints vs Stripe CLI
   - Dashboard: Use for production
   - Stripe CLI: Use for local development

2. **Raw Body Parsing** - Already configured in `src/index.ts`
   - Webhook route MUST be before `express.json()` middleware

3. **Customer Portal** - Enable in [Dashboard > Settings > Billing](https://dashboard.stripe.com/settings/billing/portal)

4. **Test vs Live Mode** - Remember to switch to live mode keys for production

## 🐛 Quick Troubleshooting

**"Cannot find Stripe publishable key"**
→ Add `VITE_STRIPE_PUBLISHABLE_KEY` to frontend `.env`

**"Webhook signature verification failed"**
→ Check webhook secret matches (Dashboard vs CLI)
→ Verify raw body parser is configured

**"Billing setup required" after setup**
→ Check `setup_intent.succeeded` webhook was received
→ Verify webhook is forwarding to correct URL

**Subscription not updating when accounts added**
→ Check backend logs for subscription update calls
→ Verify Price IDs are correct

## ✨ You're All Set!

Your billing system is now ready to:
- ✅ Charge $399/month for the base plan (new signups, includes 5 accounts)
- ✅ Keep $199/month legacy orgs on their existing price via `STRIPE_PRICE_ID_BASE_LEGACY`
- ✅ Charge $45/month per additional account
- ✅ Invoice AI usage monthly at cost
- ✅ Allow customers to manage their own billing
- ✅ Handle all subscription lifecycle events

Need more details? See:
- `docs/BILLING_SETUP_GUIDE.md` - Comprehensive setup guide
- `docs/BILLING_IMPLEMENTATION_SUMMARY.md` - Full implementation details
- `docs/AI_USAGE_TRACKING.md` - AI usage billing details

