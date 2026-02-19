import express, { Request, Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import MongoStore from 'connect-mongo';

import authRoutes from './routes/authRoutes';
import nylasRoutes from './routes/nylasRoutes';
import prospectRoutes from './routes/prospectRoutes';
import contactRoutes from './routes/contactRoutes';
import activityRoutes from './routes/activityRoutes';
import actionRoutes from './routes/actionRoutes';
import opportunityRoutes from './routes/opportunityRoutes';
import salesPlaybookRoutes from './routes/salesPlaybookRoutes';
import intelRoutes from './routes/intelRoutes';
import competitorRoutes from './routes/competitorRoutes';
import calendarActivityRoutes from './routes/calendarActivityRoutes';
import webhookRoutes from './routes/webhookRoutes';
import digitalSalesRoomRoutes from './routes/digitalSalesRoomRoutes';
import emailActivitiesRoutes from './routes/emailActivitiesRoutes';
import adminRoutes from './routes/admin/adminRoutes';
import userSettingsRoutes from './routes/userSettingsRoutes';
import notetakerRoutes from './routes/notetakerRoutes';
import teamRoutes from './routes/teamRoutes';
import aiUsageRoutes from './routes/aiUsageRoutes';
import evalRoutes from './routes/evalRoutes';
import pipelineStageRoutes from './routes/pipelineStageRoutes';
import pipelineRoutes from './routes/pipelineRoutes';
import externalWebhookRoutes from './routes/externalWebhookRoutes';
import apiKeyRoutes from './routes/apiKeyRoutes';
import billingRoutes from './routes/billingRoutes';
import stripeWebhookRoutes from './routes/stripeWebhookRoutes';
import activityStatsRoutes from './routes/activityStatsRoutes';
import directoryRoutes from './routes/directoryRoutes';
import minedDealRoutes from './routes/minedDealRoutes';
import openaiKeyRoutes from './routes/openaiKeyRoutes';

// Initialize Express app
const app = express();

// Trust proxy - needed for secure cookies in production with proxies
app.set('trust proxy', 1);

// Stripe webhook route with raw body parsing (MUST be before express.json())
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookRoutes);

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Enhanced CORS configuration with proper preflight handling
app.use(cors({
  origin: [process.env.CLIENT_URL!, 'http://localhost:3000', process.env.BLURRY_URL!],
  credentials: true,
  exposedHeaders: ['X-Document-Access-Id'],
}));

app.use(morgan('dev'));

app.use(cookieParser(process.env.SESSION_SECRET!));

// Session middleware for digital sales room visitors
app.use(session({
  secret: process.env.SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI,
    collectionName: 'sessions',
    ttl: 24 * 60 * 60, // 1 day
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  },
}));

// Simulate slow responses with a delay middleware
// Can be enabled with SIMULATE_DELAY env variable or ?delay=true query param
app.use((req: Request, res: Response, next: Function) => {
  const simulateDelay = process.env.SIMULATE_DELAY === 'true' || req.query.delay === 'true';

  if (simulateDelay) {
    const delayMs = parseInt(req.query.delayMs as string || process.env.DELAY_MS || '2000', 10);
    console.log(`Simulating delay of ${delayMs}ms for ${req.method} ${req.path}`);
    setTimeout(next, delayMs);
  } else {
    next();
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/nylas', nylasRoutes);
app.use('/api/prospects', prospectRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/actions', actionRoutes);
app.use('/api/opportunities', opportunityRoutes);
app.use('/api/sales-playbook', salesPlaybookRoutes);
app.use('/api/intel', intelRoutes);
app.use('/api/competitors', competitorRoutes);
app.use('/api/calendar-activities', calendarActivityRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/webhooks', externalWebhookRoutes);
app.use('/api/digital-sales-rooms', digitalSalesRoomRoutes);
app.use('/api/email-activities', emailActivitiesRoutes);
app.use('/api/notetaker', notetakerRoutes);

app.use('/api/admin', adminRoutes);
app.use('/api/user/settings', userSettingsRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/ai-usage', aiUsageRoutes);
app.use('/api/evals', evalRoutes);
app.use('/api/pipeline-stages', pipelineStageRoutes);
app.use('/api/pipelines', pipelineRoutes);
app.use('/api/api-keys', apiKeyRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/activity-stats', activityStatsRoutes);
app.use('/api/directory', directoryRoutes);
app.use('/api/mined-deals', minedDealRoutes);
app.use('/api/organization', openaiKeyRoutes);

// Default route
app.get('/', (req: Request, res: Response) => {
  res.send('API is running');
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: Function) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export { app };
