require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const expressLayouts = require('express-ejs-layouts');
const methodOverride = require('method-override');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const logger = require('./config/logger');
const { attachUser, refreshUser } = require('./middleware/auth');

const app = express();
app.set('trust proxy', 1);

// Ensure DB schema exists (idempotent) — this must finish before the app
// starts accepting requests, since Postgres queries are asynchronous.
const migrate = require('./db/migrate');

// ----- Security headers -----
// CSP is scoped to the actual CDNs this app loads from (Bootstrap, Remix Icons,
// Google Fonts, Chart.js, ui-avatars, Razorpay checkout + its iframes/API calls).
// A default-locked-down CSP would silently break the UI, so every external host
// actually used in the views is listed explicitly below.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://checkout.razorpay.com"],
      // Without this, helmet defaults script-src-attr to 'none', which silently
      // blocks every inline onclick/onchange/onerror="" handler in the views
      // (avatar upload trigger, broken-image fallbacks, dropdown toggles, etc).
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      mediaSrc: ["'self'", "blob:", "https:", "https://www.neuroanatomy.ca", "https://commondatastorage.googleapis.com"],
      frameSrc: ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com", "https://sketchfab.com", "https://www.neuroanatomy.ca", "https://api.razorpay.com", "https://checkout.razorpay.com"],
      workerSrc: ["'self'", "blob:"],
      connectSrc: ["'self'", "https://api.razorpay.com", "https://lumberjack.razorpay.com", "https://cdn.jsdelivr.net"],
    }
  },
  crossOriginEmbedderPolicy: false // would otherwise block the Razorpay + YouTube iframes
}));

// Additional security headers — block browser share/download integrations
app.use(function(req, res, next) {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Permissions-Policy', 'clipboard-write=(), clipboard-read=(), web-share=()');
  next();
});

// ----- View engine -----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// ----- Core middleware -----
// Gzip responses — standard for production Node apps, reduces bandwidth
// for HTML/CSS/JS with no behavior change to routes or views.
app.use(compression());
app.use(morgan('dev', {
  stream: { write: (message) => logger.info(message.trim()) },
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(session({
  secret: env.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    httpOnly: true,
    secure: false, // Ensures session cookies set reliably across all cloud reverse proxy environments
    sameSite: 'lax'
  }
}));
app.use(flash());

// ----- Brute-force protection on login/register -----
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                  // 20 attempts per IP per window
  message: 'Too many attempts. Please try again in a few minutes.',
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/auth/login', authLimiter);
app.use('/auth/register', authLimiter);
app.use('/auth', (req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

app.use(refreshUser);
app.use(attachUser);

// Flash + global locals available to every view
app.use(async (req, res, next) => {
  res.locals.successMessages = req.flash('success');
  res.locals.errorMessages = req.flash('error');
  res.locals.siteName = 'PhysioEdvance';
  res.locals.showDemoCredentials = env.showDemoCredentials;
  try {
    const { SiteSettings, HomepageSection } = require('./models/Content');
    const [groupStatuses, heroSettings, dynamicHomepageSections] = await Promise.all([
      SiteSettings.getTeamGroupStatuses(),
      SiteSettings.getHeroSettings(),
      HomepageSection.all().catch(() => [])
    ]);
    res.locals.teamNavGroups = groupStatuses;
    res.locals.trustBarSettings = {
      enabled: heroSettings.trustBarEnabled,
      items: heroSettings.trustBarItems,
      speed: heroSettings.trustBarSpeed || 55
    };
    res.locals.adminHomepageNavSections = dynamicHomepageSections || [];
  } catch (err) {
    res.locals.teamNavGroups = { teaching_staff: true, non_teaching_staff: true, subject_experts: true, technical_assistance: true, other_staff: true };
    res.locals.trustBarSettings = {
      enabled: true,
      speed: 55,
      items: [
        { icon: 'ri-megaphone-line', text: 'Quick Revision' },
        { icon: 'ri-book-open-line', text: 'Examination Preparation' },
        { icon: 'ri-stack-line', text: 'Subject-wise Learning' },
        { icon: 'ri-settings-4-line', text: 'Clinical Application' },
        { icon: 'ri-file-text-line', text: 'Evidence-Informed Answers' },
        { icon: 'ri-focus-3-line', text: 'Aligned with Indian Physiotherapy Curriculum' }
      ]
    };
    res.locals.adminHomepageNavSections = [];
  }
  next();
});

// ----- Subdomain detection -----
// The proposal calls for subjects.physioedvance.com (and a separate "Core
// Aspects" subdomain for Notes/Digital Library/Research Desk/Blog). Rather
// than running separate deployments, this single app detects the subdomain
// from the request Host header and exposes it as req.subdomain — routes can
// check this to serve subdomain-specific content. The root domain (and
// localhost during development) behave as the main site.
app.use((req, res, next) => {
  const host = (req.headers.host || '').split(':')[0]; // strip port
  const parts = host.split('.');
  // e.g. "subjects.physioedvance.com" -> ["subjects", "physioedvance", "com"]
  req.subdomain = parts.length > 2 ? parts[0] : null;
  res.locals.subdomain = req.subdomain;
  next();
});

// ----- Routes -----

// When visited via subjects.physioedvance.com, send "/" straight to the
// subjects index instead of the marketing homepage — everything else
// (e.g. /anatomy) still resolves normally through the same route handlers.
app.get('/', (req, res, next) => {
  if (req.subdomain === 'subjects') return res.redirect('/subjects');
  if (req.subdomain === 'core') return res.redirect('/the-team'); // Core Aspects landing
  next();
});

app.use('/auth', require('./routes/authRoutes'));
app.use('/admin', require('./routes/adminRoutes'));
app.use('/instructor', require('./routes/instructorRoutes'));
// IMPORTANT: publicRoutes must be mounted before studentRoutes.
// studentRoutes applies `router.use(requireAuth)` to its entire router, and since
// both are mounted at '/', registering studentRoutes first would force every
// public page (home, courses, the-team, etc.) through a login redirect before
// Express ever reaches the actual public route handlers.
app.use('/', require('./routes/publicRoutes'));
app.use('/', require('./routes/studentRoutes'));

// ----- 404 handler -----
app.use((req, res) => {
  res.status(404).render('public/404', { title: 'Page Not Found', layout: 'layouts/main' });
});

// ----- Error handler -----
app.use((err, req, res, next) => {
  logger.error(err.message, { stack: err.stack, path: req.path, method: req.method });
  const statusCode = err.statusCode || 500;
  res.status(statusCode).render('public/500', { title: 'Server Error', layout: 'layouts/main', error: env.isProduction ? null : err });
});

const server = app.listen(env.port, '0.0.0.0', () => {
  logger.info(`PhysioEdvance running on 0.0.0.0:${env.port}`);
  console.log(`\n🧑‍⚕️ PhysioEdvance running on port ${env.port} (0.0.0.0)\n`);

  migrate()
    .then(() => {
      logger.info('Database schema migration completed successfully.');
      console.log('✅ Database schema migration completed successfully.');
    })
    .catch(err => {
      logger.error('Failed to apply database schema', { stack: err.stack });
      console.error('❌ Failed to apply database schema:', err.message);
    });
});

module.exports = app;
