# 📊 SOLMATES PRODUCTION MONITORING GUIDE

This guide provides comprehensive instructions for monitoring and alerting in production.

---

## 🎯 MONITORING OBJECTIVES

1. **Uptime Monitoring** - Ensure system is accessible
2. **Error Tracking** - Catch and fix bugs quickly
3. **Performance Monitoring** - Maintain fast response times
4. **Security Monitoring** - Detect suspicious activity
5. **Resource Monitoring** - Prevent outages from resource exhaustion

---

## 🔔 ALERTING SYSTEM IMPLEMENTATION

### Option 1: Email Alerts

**Install Dependencies:**
```bash
npm install nodemailer
```

**Create:** `backend/src/utils/email-alerter.js`
```javascript
const nodemailer = require('nodemailer');
const logger = require('./logger');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendCriticalAlert(subject, message, error = null) {
  const emailContent = `
    <h2>🚨 CRITICAL ALERT: ${subject}</h2>
    <p><strong>Time:</strong> ${new Date().toISOString()}</p>
    <p><strong>Environment:</strong> ${process.env.NODE_ENV}</p>
    <p><strong>Message:</strong> ${message}</p>
    ${error ? `
      <h3>Error Details:</h3>
      <pre>${JSON.stringify(error, null, 2)}</pre>
      <pre>${error.stack}</pre>
    ` : ''}
  `;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: process.env.ALERT_EMAIL,
      subject: `🚨 SOLMATES ALERT: ${subject}`,
      html: emailContent
    });
    logger.info(`Critical alert email sent: ${subject}`);
  } catch (emailError) {
    logger.error('Failed to send alert email:', emailError);
  }
}

module.exports = { sendCriticalAlert };
```

**Usage in database.js:**
```javascript
const { sendCriticalAlert } = require('../utils/email-alerter');

// In session cleanup failure (line 170-177)
if (attempt >= maxRetries) {
  logger.error('CRITICAL: Session cleanup failed after max retries - manual intervention required');
  
  // Send email alert
  await sendCriticalAlert(
    'Session Cleanup Failed',
    'Session cleanup failed after maximum retry attempts. Manual intervention required.',
    new Error('Session cleanup failure')
  );
  
  throw new Error('Session cleanup failed after maximum retry attempts');
}
```

---

### Option 2: Slack Alerts

**Install Dependencies:**
```bash
npm install @slack/webhook
```

**Create:** `backend/src/utils/slack-alerter.js`
```javascript
const { IncomingWebhook } = require('@slack/webhook');
const logger = require('./logger');

const webhook = new IncomingWebhook(process.env.SLACK_WEBHOOK_URL);

async function sendSlackAlert(severity, title, message, error = null) {
  const color = {
    critical: '#FF0000',
    warning: '#FFA500',
    info: '#00FF00'
  }[severity] || '#808080';

  const payload = {
    attachments: [{
      color: color,
      title: `${severity.toUpperCase()}: ${title}`,
      text: message,
      fields: [
        {
          title: 'Environment',
          value: process.env.NODE_ENV,
          short: true
        },
        {
          title: 'Timestamp',
          value: new Date().toISOString(),
          short: true
        }
      ],
      footer: 'SOLMATES Monitoring',
      footer_icon: 'https://solmates.com/icon.png'
    }]
  };

  if (error) {
    payload.attachments[0].fields.push({
      title: 'Error Details',
      value: `\`\`\`${error.stack || JSON.stringify(error)}\`\`\``,
      short: false
    });
  }

  try {
    await webhook.send(payload);
    logger.info(`Slack alert sent: ${title}`);
  } catch (slackError) {
    logger.error('Failed to send Slack alert:', slackError);
  }
}

module.exports = { sendSlackAlert };
```

**Setup Slack Webhook:**
1. Go to https://api.slack.com/apps
2. Create new app → "From scratch"
3. Select workspace
4. Add "Incoming Webhooks" feature
5. Activate webhooks
6. Click "Add New Webhook to Workspace"
7. Choose channel (#alerts recommended)
8. Copy webhook URL to `.env`:
   ```
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
   ```

---

### Option 3: PagerDuty Integration

**Install Dependencies:**
```bash
npm install @pagerduty/pdjs
```

**Create:** `backend/src/utils/pagerduty-alerter.js`
```javascript
const { event } = require('@pagerduty/pdjs');
const logger = require('./logger');

async function sendPagerDutyAlert(severity, title, message, error = null) {
  const payload = {
    routing_key: process.env.PAGERDUTY_INTEGRATION_KEY,
    event_action: 'trigger',
    payload: {
      summary: title,
      severity: severity, // critical, error, warning, info
      source: 'solmates-backend',
      custom_details: {
        message: message,
        environment: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
        error: error ? {
          message: error.message,
          stack: error.stack
        } : null
      }
    }
  };

  try {
    const response = await event(payload);
    logger.info(`PagerDuty alert sent: ${title}`, response);
  } catch (pdError) {
    logger.error('Failed to send PagerDuty alert:', pdError);
  }
}

module.exports = { sendPagerDutyAlert };
```

---

## 📈 ERROR TRACKING

### Sentry Integration

**Install:**
```bash
npm install @sentry/node @sentry/tracing
```

**Add to server.js (after line 23):**
```javascript
const Sentry = require('@sentry/node');
const Tracing = require('@sentry/tracing');

// Initialize Sentry
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: parseFloat(process.env.SENTRY_SAMPLE_RATE) || 1.0,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Tracing.Integrations.Express({ app }),
    ],
  });

  // Sentry request handler (must be first middleware)
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
  
  logger.info('Sentry error tracking initialized');
}
```

**Add before error middleware (after line 145):**
```javascript
// Sentry error handler (must be before other error middleware)
if (process.env.NODE_ENV === 'production' && process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}
```

**Setup Sentry:**
1. Create account at https://sentry.io
2. Create new project (Node.js/Express)
3. Copy DSN to `.env`:
   ```
   SENTRY_DSN=https://YOUR_KEY@sentry.io/YOUR_PROJECT
   SENTRY_ENVIRONMENT=production
   SENTRY_SAMPLE_RATE=1.0
   ```

---

## 📊 PERFORMANCE MONITORING

### Add Performance Metrics Endpoint

**Add to server.js:**
```javascript
// Performance metrics endpoint
app.get('/api/metrics', authenticateToken, (req, res) => {
  const metrics = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    timestamp: new Date().toISOString(),
    requests: {
      // Add request counting logic here
    }
  };
  
  res.json(metrics);
});
```

### New Relic Integration

**Install:**
```bash
npm install newrelic
```

**Create:** `backend/newrelic.js`
```javascript
'use strict'

exports.config = {
  app_name: ['SOLMATES'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  logging: {
    level: 'info'
  },
  allow_all_headers: true,
  attributes: {
    exclude: [
      'request.headers.cookie',
      'request.headers.authorization',
      'request.headers.proxyAuthorization',
      'request.headers.setCookie*',
      'request.headers.x*',
      'response.headers.cookie',
      'response.headers.authorization',
      'response.headers.proxyAuthorization',
      'response.headers.setCookie*',
      'response.headers.x*'
    ]
  }
}
```

**Add to top of server.js:**
```javascript
if (process.env.NEW_RELIC_LICENSE_KEY) {
  require('newrelic');
}
```

---

## 🔍 LOG AGGREGATION

### Winston Configuration Enhancement

**Update:** `backend/src/utils/logger.js`

Add cloud logging transport:
```javascript
// Add after existing transports

// CloudWatch Logs (AWS)
if (process.env.AWS_CLOUDWATCH_LOG_GROUP) {
  const WinstonCloudWatch = require('winston-cloudwatch');
  
  logger.add(new WinstonCloudWatch({
    logGroupName: process.env.AWS_CLOUDWATCH_LOG_GROUP,
    logStreamName: `${process.env.NODE_ENV}-${new Date().toISOString().split('T')[0]}`,
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
    awsRegion: process.env.AWS_REGION
  }));
}

// Loggly (Cloud logging)
if (process.env.LOGGLY_TOKEN) {
  const { Loggly } = require('winston-loggly-bulk');
  
  logger.add(new Loggly({
    token: process.env.LOGGLY_TOKEN,
    subdomain: process.env.LOGGLY_SUBDOMAIN,
    tags: ['solmates', process.env.NODE_ENV],
    json: true
  }));
}
```

---

## 🚨 HEALTH CHECK ENDPOINT (Enhanced)

**Update server.js health check (around line 189):**
```javascript
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      external: Math.round(process.memoryUsage().external / 1024 / 1024),
      unit: 'MB'
    },
    environment: process.env.NODE_ENV,
    version: require('./package.json').version,
    checks: {
      database: 'checking...',
      api: 'healthy'
    }
  };

  // Check database accessibility
  try {
    const db = await readDB();
    health.checks.database = 'healthy';
    health.stats = {
      sessions: Object.keys(db.sessions || {}).length,
      notes: (db.content?.notes || []).length,
      pyq: (db.content?.pyq || []).length,
      oneshot: (db.content?.oneshot || []).length,
      elearning: (db.content?.elearning || []).length,
      professor: (db.content?.professor || []).length,
      classes: (db.content?.classes || []).length,
      youtube: Object.keys(db.youtube || {}).length
    };
  } catch (error) {
    health.status = 'degraded';
    health.checks.database = 'unhealthy';
    health.error = error.message;
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});
```

---

## 📱 UPTIME MONITORING

### Option 1: UptimeRobot (Free)

1. Create account at https://uptimerobot.com
2. Add New Monitor:
   - **Monitor Type:** HTTP(s)
   - **Friendly Name:** SOLMATES Backend
   - **URL:** https://your-backend.com/api/health
   - **Monitoring Interval:** 5 minutes
3. Add Alert Contacts (Email, SMS, Slack)

### Option 2: Pingdom

1. Create account at https://pingdom.com
2. Add New Check:
   - **Check Type:** HTTP
   - **Name:** SOLMATES API
   - **URL:** https://your-backend.com/api/health
   - **Check Interval:** 1 minute
3. Configure alerts

### Option 3: StatusCake

1. Create account at https://statuscake.com
2. Add New Uptime Test
3. Configure alerts

---

## 📊 MONITORING DASHBOARD

### Create Admin Monitoring Page

**Create:** `frontend/admin/monitoring.html`
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SOLMATES Monitoring</title>
  <script src="/js/api-client.js"></script>
  <script src="/js/auth-guard.js"></script>
</head>
<body>
  <div class="container">
    <h1>System Monitoring</h1>
    
    <div class="metrics-grid">
      <div class="metric-card">
        <h3>Uptime</h3>
        <p id="uptime">Loading...</p>
      </div>
      
      <div class="metric-card">
        <h3>Memory Usage</h3>
        <p id="memory">Loading...</p>
      </div>
      
      <div class="metric-card">
        <h3>Database Status</h3>
        <p id="database">Loading...</p>
      </div>
      
      <div class="metric-card">
        <h3>Active Sessions</h3>
        <p id="sessions">Loading...</p>
      </div>
    </div>
    
    <div class="content-stats">
      <h2>Content Statistics</h2>
      <table id="statsTable">
        <thead>
          <tr>
            <th>Content Type</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody id="statsBody"></tbody>
      </table>
    </div>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', async function() {
      // Require admin authentication
      if (!await requireAdminAuth()) {
        return;
      }
      
      loadMetrics();
      setInterval(loadMetrics, 30000); // Refresh every 30 seconds
    });

    async function loadMetrics() {
      try {
        const response = await fetch('/api/health');
        const health = await response.json();
        
        // Update metrics
        document.getElementById('uptime').textContent = 
          formatUptime(health.uptime);
        
        document.getElementById('memory').textContent = 
          `${health.memory.used}MB / ${health.memory.total}MB`;
        
        document.getElementById('database').textContent = 
          health.checks.database;
        
        document.getElementById('sessions').textContent = 
          health.stats?.sessions || 0;
        
        // Update stats table
        const statsBody = document.getElementById('statsBody');
        statsBody.innerHTML = '';
        
        if (health.stats) {
          Object.entries(health.stats).forEach(([type, count]) => {
            if (type !== 'sessions') {
              const row = `<tr><td>${type}</td><td>${count}</td></tr>`;
              statsBody.innerHTML += row;
            }
          });
        }
      } catch (error) {
        console.error('Failed to load metrics:', error);
      }
    }

    function formatUptime(seconds) {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${days}d ${hours}h ${minutes}m`;
    }
  </script>
</body>
</html>
```

---

## 🔐 SECURITY MONITORING

### Rate Limit Alerts

**Add to rateLimiter.middleware.js:**
```javascript
const { sendSlackAlert } = require('../utils/slack-alerter');

// In each rate limiter, add onLimitReached handler
handler: async (req, res) => {
  const ip = req.ip;
  logger.warn(`Rate limit exceeded for IP: ${ip} on ${req.path}`);
  
  // Alert on repeated violations
  const violations = await trackViolations(ip);
  if (violations > 10) {
    await sendSlackAlert(
      'warning',
      'Repeated Rate Limit Violations',
      `IP ${ip} has exceeded rate limits ${violations} times in the last hour. Possible attack.`
    );
  }
  
  res.status(429).json({
    success: false,
    message: 'Too many requests. Please try again later.'
  });
}
```

### Failed Login Alerts

**Add to auth.controller.js:**
```javascript
const { sendSlackAlert } = require('../utils/slack-alerter');

// After failed login tracking (line 65)
if (failures.length >= 5) {
  await sendSlackAlert(
    'warning',
    'Multiple Failed Login Attempts',
    `${failures.length} failed login attempts from IP ${ipAddress} for admin ID: ${adminId}`
  );
}
```

---

## 📋 MONITORING CHECKLIST

### Daily:
- [ ] Check uptime monitoring dashboard
- [ ] Review error tracking (Sentry)
- [ ] Check Slack/email for alerts
- [ ] Verify backup creation

### Weekly:
- [ ] Review logs for anomalies
- [ ] Check performance metrics
- [ ] Review rate limit violations
- [ ] Verify disk space usage

### Monthly:
- [ ] Rotate credentials
- [ ] Review and update dependencies
- [ ] Load testing
- [ ] Backup restoration test
- [ ] Security audit

---

## 🎯 RECOMMENDED MONITORING STACK

### Minimum (Free):
- **Uptime:** UptimeRobot
- **Errors:** Sentry (free tier)
- **Alerts:** Slack webhooks
- **Logs:** Winston file logs

### Recommended (Paid):
- **Uptime:** Pingdom
- **Errors:** Sentry (paid tier)
- **Performance:** New Relic
- **Logs:** CloudWatch / Loggly
- **Alerts:** PagerDuty
- **Dashboard:** Grafana + Prometheus

### Enterprise:
- **Full Stack:** DataDog
- **Alerts:** PagerDuty
- **Logs:** Splunk
- **Security:** Cloudflare
- **Dashboard:** Custom Grafana

---

## 📞 ALERT ESCALATION POLICY

1. **Level 1 - Info:** Log only
2. **Level 2 - Warning:** Slack notification
3. **Level 3 - Error:** Slack + Email
4. **Level 4 - Critical:** Slack + Email + SMS (PagerDuty)

**Examples:**
- Database backup failure → Level 3
- Session cleanup failure → Level 4
- Rate limit violation → Level 2
- Multiple failed logins → Level 3
- API downtime → Level 4

---

This guide should be customized based on your specific hosting infrastructure and team preferences.
