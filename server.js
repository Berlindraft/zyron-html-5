const express = require('express');
const nodemailer = require('nodemailer');
const axios = require('axios');
const UAParser = require('ua-parser-js');
const app = express();

// Trust proxy for accurate IP detection when behind load balancers
app.set('trust proxy', true);

// Store session start times for each IP
const sessionStarts = {};

// Email transporter configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'staysane.rz@gmail.com', // Your Gmail address
    pass: 'nvkq cudo ibhh usdr',   // Your Gmail app password (consider using environment variables)
  },
});

// Middleware to track session start time
app.use((req, res, next) => {
  const ip = req.ip;
  if (!sessionStarts[ip]) {
    sessionStarts[ip] = new Date();
  }
  next();
});

// Route handler for the root path
app.get('/', async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';
  const referrer = req.headers['referer'] || req.headers['referrer'] || 'direct';

  // Skip tracking for uptime monitoring services
  if (userAgent.includes('UptimeRobot') || userAgent.includes('pingbot')) {
    return res.status(204).end();
  }

  // Format timestamp
  const timestamp = new Date();
  const day = timestamp.toLocaleString('en-US', { weekday: 'long' });
  const date = timestamp.toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const time = timestamp.toLocaleString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit', 
    hour12: true 
  });

  // Parse user agent
  const parser = new UAParser(userAgent);
  const device = parser.getDevice();
  const os = parser.getOS();
  const browser = parser.getBrowser();
  const engine = parser.getEngine();
  const cpu = parser.getCPU();
  const deviceType = device.type || 'Unknown';

  // Network information
  const connectionType = inferConnectionType(req);
  const sessionStart = sessionStarts[ip];
  const sessionDuration = sessionStart ? 
    `${Math.round((new Date() - sessionStart) / 1000)} seconds` : 
    'First visit';

  // --- Location Data Collection ---
  let location_ipinfo = 'N/A';
  let lat_ipinfo = null;
  let lon_ipinfo = null;
  let isp_ipinfo = 'N/A';

  try {
    const ipinfoToken = '5cbabbc7ad7b57'; // Consider using environment variable
    const geo = await axios.get(`https://ipinfo.io/${ip}?token=${ipinfoToken}`);
    const { city, region, country, org, loc, hostname } = geo.data;

    location_ipinfo = `${city || 'Unknown'}, ${region || 'Unknown'}, ${country || 'Unknown'}`;
    isp_ipinfo = org || 'Unknown ISP';
    
    if (loc) {
      const [latitude, longitude] = loc.split(',');
      lat_ipinfo = latitude;
      lon_ipinfo = longitude;
    }
  } catch (err) {
    console.warn('IPInfo failed:', err.message);
  }

  // Compose email
const mailOptions = {
  from: 'Website Tracker <staysane.rz@gmail.com>',
  to: 'xraymundzyron@gmail.com',
  subject: `New Visitor from ${location_ipinfo.split(',')[0] || 'Unknown Location'}`,
  html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Visitor Notification</title>
  <style>
    body {
      background: #f7f7f7;
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Arial, sans-serif;
      color: #222;
    }
    .card {
      background: #fff;
      border-radius: 10px;
      max-width: 98vw;
      margin: 18px auto;
      padding: 20px 5vw 18px 5vw;
      box-shadow: 0 2px 8px rgba(44,62,80,0.08);
    }
    h1 {
      font-size: 1.3em;
      color: #3498db;
      margin: 0 0 18px 0;
      text-align: center;
    }
    .section {
      margin-bottom: 18px;
    }
    .label {
      color: #888;
      font-size: 1em;
      font-weight: 600;
      display: block;
      margin-bottom: 2px;
    }
    .value {
      font-size: 1.08em;
      margin-bottom: 10px;
      word-break: break-all;
    }
    .map-link {
      display: inline-block;
      background: #3498db;
      color: #fff;
      padding: 8px 16px;
      border-radius: 4px;
      text-decoration: none;
      font-size: 1em;
      margin-top: 8px;
    }
    .footer {
      text-align: center;
      color: #aaa;
      font-size: 0.95em;
      margin-top: 24px;
    }
    @media (max-width: 480px) {
      .card { padding: 12px 2vw; }
      h1 { font-size: 1.1em; }
      .value, .label { font-size: 1em; }
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>🚀 New Website Visit Detected</h1>
    <div class="section">
      <span class="label">Day</span>
      <div class="value">${day}</div>
      <span class="label">Date</span>
      <div class="value">${date}</div>
      <span class="label">Time</span>
      <div class="value">${time}</div>
    </div>
    <div class="section">
      <span class="label">IP Address</span>
      <div class="value">${ip}</div>
      <span class="label">Connection</span>
      <div class="value">${connectionType}</div>
      <span class="label">ISP</span>
      <div class="value">${isp_ipinfo}</div>
    </div>
    <div class="section">
      <span class="label">Location</span>
      <div class="value">${location_ipinfo}</div>
      <span class="label">Coordinates</span>
      <div class="value">${lat_ipinfo || 'N/A'}, ${lon_ipinfo || 'N/A'}</div>
      ${lat_ipinfo && lon_ipinfo ? `<a href="https://www.google.com/maps?q=${lat_ipinfo},${lon_ipinfo}" class="map-link">View on Google Maps</a>` : ''}
    </div>
    <div class="section">
      <span class="label">Device Type</span>
      <div class="value">${deviceType}</div>
      <span class="label">Brand</span>
      <div class="value">${device.vendor || 'Unknown'}</div>
      <span class="label">Model</span>
      <div class="value">${device.model || 'Unknown'}</div>
      <span class="label">OS</span>
      <div class="value">${os.name || 'OS'} ${os.version || ''}</div>
      <span class="label">Browser</span>
      <div class="value">${browser.name || 'Browser'} ${browser.version || ''}</div>
    </div>
    <div class="section">
      <span class="label">Session Duration</span>
      <div class="value">${sessionDuration}</div>
      <span class="label">Referrer</span>
      <div class="value">${referrer}</div>
      <span class="label">User Agent</span>
      <div class="value">${userAgent}</div>
    </div>
    <div class="footer">
      This notification was generated automatically.<br>
      <span>${new Date().toLocaleString()}</span>
    </div>
  </div>
</body>
</html>`
};

  // Send email (fire and forget)
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Email failed:', error);
    } else {
      console.log('Email sent:', info.messageId);
    }
  });

  // Serve the actual website
  res.sendFile(__dirname + '/index.html');
});

// Helper function to guess connection type
function inferConnectionType(req) {
  const ip = req.ip;
  
  // Private IP ranges often indicate mobile or NAT
  if (ip.startsWith('192.168.') || 
      ip.startsWith('172.16.') || 
      ip.startsWith('10.')) {
    return 'Likely Mobile (Cellular) or Behind NAT';
  }
  
  // Cloudflare headers can provide more info
  if (req.headers['cf-connecting-ip']) {
    return 'Behind Cloudflare (possibly any connection)';
  }
  
  return 'Likely WiFi/Landline';
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  
  // Send error notification email
  const errorMailOptions = {
    from: 'Website Tracker Error <staysane.rz@gmail.com>',
    to: 'xraymundzyron@gmail.com',
    subject: 'Tracker Error Occurred',
    text: `An error occurred in your website tracker:
    
Error: ${err.message}
Stack: ${err.stack}

Request Info:
IP: ${req.ip}
URL: ${req.originalUrl}
User Agent: ${req.headers['user-agent']}`
  };
  
  transporter.sendMail(errorMailOptions);
  
  res.status(500).send('Internal Server Error');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tracker running on port ${PORT}`));