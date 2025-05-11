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
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
        }
        .container {
            background-color: white;
            border-radius: 8px;
            padding: 25px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2c3e50;
            border-bottom: 2px solid #3498db;
            padding-bottom: 10px;
            margin-top: 0;
        }
        h2 {
            color: #3498db;
            margin-top: 25px;
            font-size: 1.3em;
        }
        .info-grid {
            display: grid;
            grid-template-columns: 30px auto;
            gap: 10px;
            align-items: center;
            margin-bottom: 8px;
        }
        .emoji {
            font-size: 1.2em;
            text-align: center;
        }
        .label {
            font-weight: bold;
            color: #7f8c8d;
        }
        .value {
            margin-left: 40px;
            word-break: break-all;
        }
        .map-link {
            display: inline-block;
            background-color: #3498db;
            color: white;
            padding: 8px 15px;
            border-radius: 4px;
            text-decoration: none;
            margin-top: 5px;
        }
        .map-link:hover {
            background-color: #2980b9;
        }
        .json {
            background-color: #f5f5f5;
            padding: 10px;
            border-radius: 4px;
            font-family: monospace;
            white-space: pre-wrap;
            overflow-x: auto;
        }
        .footer {
            margin-top: 30px;
            font-size: 0.9em;
            color: #95a5a6;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 New website visit detected!</h1>
        
        <h2>📅 TIMESTAMP</h2>
        <div class="info-grid">
            <div class="emoji">📅</div>
            <div><span class="label">Day:</span> ${day}</div>
            <div class="emoji">📆</div>
            <div><span class="label">Date:</span> ${date}</div>
            <div class="emoji">⏰</div>
            <div><span class="label">Time:</span> ${time}</div>
        </div>

        <h2>🌐 NETWORK</h2>
        <div class="info-grid">
            <div class="emoji">🌐</div>
            <div><span class="label">IP Address:</span> ${ip}</div>
            <div class="emoji">🔌</div>
            <div><span class="label">Connection:</span> ${connectionType}</div>
            <div class="emoji">📡</div>
            <div><span class="label">ISP:</span> ${isp_ipinfo}</div>
        </div>

        <h2>📍 LOCATION</h2>
        <div class="info-grid">
            <div class="emoji">📍</div>
            <div><span class="label">Location:</span> ${location_ipinfo}</div>
            <div class="emoji">🧭</div>
            <div><span class="label">Coordinates:</span> ${lat_ipinfo || 'N/A'}, ${lon_ipinfo || 'N/A'}</div>
        </div>
        ${lat_ipinfo && lon_ipinfo ? 
          `<a href="https://www.google.com/maps?q=${lat_ipinfo},${lon_ipinfo}" class="map-link">View on Google Maps</a>` : 
          '<div style="color: #95a5a6;">Location unavailable for mapping</div>'}

        <h2>📱 DEVICE</h2>
        <div class="info-grid">
            <div class="emoji">📱</div>
            <div><span class="label">Device Type:</span> ${deviceType}</div>
            <div class="emoji">🏷️</div>
            <div><span class="label">Brand:</span> ${device.vendor || 'Unknown'}</div>
            <div class="emoji">🖥️</div>
            <div><span class="label">Model:</span> ${device.model || 'Unknown'}</div>
            <div class="emoji">💻</div>
            <div><span class="label">OS:</span> ${os.name || 'OS'} ${os.version || ''}</div>
            <div class="emoji">🌐</div>
            <div><span class="label">Browser:</span> ${browser.name || 'Browser'} ${browser.version || ''}</div>
            <div class="emoji">⚙️</div>
            <div><span class="label">Engine:</span> ${engine.name || 'Unknown engine'}</div>
            <div class="emoji">🔧</div>
            <div><span class="label">CPU:</span> ${cpu.architecture || 'Unknown CPU architecture'}</div>
        </div>

        <h2>⏱️ SESSION</h2>
        <div class="info-grid">
            <div class="emoji">⏱️</div>
            <div><span class="label">Duration:</span> ${sessionDuration}</div>
            <div class="emoji">🔗</div>
            <div><span class="label">Referrer:</span> ${referrer}</div>
        </div>
        <div class="value">
            <span class="label">User Agent:</span><br>
            ${userAgent}
        </div>

        <h2>📶 ADDITIONAL INFO</h2>
        <div class="json">
            ${JSON.stringify({
                'x-forwarded-for': req.headers['x-forwarded-for'],
                'cf-connecting-ip': req.headers['cf-connecting-ip'],
                'x-real-ip': req.headers['x-real-ip']
            }, null, 2)}
        </div>

        <div class="footer">
            <p>This notification was generated automatically by your website tracker.</p>
            <p>${new Date().toLocaleString()}</p>
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