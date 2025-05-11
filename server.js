const express = require('express');
const nodemailer = require('nodemailer');
const axios = require('axios');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');
const app = express();

// Configuration
app.set('trust proxy', true);
const sessionStarts = {};

// Email Configuration
const emailConfig = {
  service: 'gmail',
  auth: {
    user: 'staysane.rz@gmail.com',
    pass: 'nvkq cudo ibhh usdr',
  },
  tls: {
    rejectUnauthorized: false // For development only, remove in production
  }
};

// Create transporter with connection pooling
const transporter = nodemailer.createTransport(emailConfig);

// Verify transporter connection on startup
transporter.verify((error) => {
  if (error) {
    console.error('SMTP Connection Error:', error);
  } else {
    console.log('SMTP Server is ready to send emails');
  }
});

// Middleware
app.use(express.static(__dirname));
app.use((req, res, next) => {
  const ip = req.ip;
  if (!sessionStarts[ip]) {
    sessionStarts[ip] = {
      startTime: new Date(),
      pageViews: 0
    };
  }
  sessionStarts[ip].pageViews++;
  next();
});

// Helper Functions
function formatTimestamp() {
  const now = new Date();
  return {
    date: now.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      timeZone: 'Asia/Manila'
    }),
    time: now.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: true,
      timeZone: 'Asia/Manila'
    }),
    day: now.toLocaleDateString('en-US', { 
      weekday: 'long',
      timeZone: 'Asia/Manila'
    }),
    iso: now.toISOString(),
    unix: Math.floor(now.getTime() / 1000)
  };
}

function inferConnectionType(req) {
  const ip = req.ip;
  const headers = req.headers;
  
  // Check for Cloudflare
  if (headers['cf-connecting-ip']) {
    const colo = headers['cf-ray']?.split('-')[1] || 'unknown';
    return `Cloudflare (${colo.toUpperCase()})`;
  }

  // Check for proxy headers
  const proxyHeaders = ['x-forwarded-for', 'via', 'client-ip', 'forwarded'];
  if (proxyHeaders.some(h => headers[h])) {
    return 'Behind Proxy/Load Balancer';
  }

  // Check for private IPs
  if (ip.startsWith('192.') || ip.startsWith('172.16.') || ip.startsWith('10.')) {
    return 'Likely Mobile (Cellular)';
  }

  // Check for Tor
  if (headers['x-tor-ip'] || (headers.host && headers.host.endsWith('.onion'))) {
    return 'Tor Network';
  }

  return 'Likely WiFi/Landline';
}

async function getGeoData(ip) {
  const geoData = {
    ipinfo: 'N/A',
    geoip: 'N/A',
    combined: 'N/A',
    coords: null,
    isp: 'Unknown',
    asn: 'Unknown'
  };

  try {
    // Try ipinfo.io first
    const ipinfoToken = '5cbabbc7ad7b57';
    const ipinfoResponse = await axios.get(`https://ipinfo.io/${ip}?token=${ipinfoToken}`);
    const { city, region, country, org, loc, asn } = ipinfoResponse.data;

    geoData.ipinfo = `${city || 'Unknown'}, ${region || 'Unknown'}, ${country || 'Unknown'}`;
    geoData.isp = org || 'Unknown';
    geoData.asn = asn?.asn || 'Unknown';
    
    if (loc) {
      geoData.coords = loc.split(',');
    }

    // Fallback to geoip-lite
    const geoipLookup = geoip.lookup(ip);
    if (geoipLookup) {
      geoData.geoip = `${geoipLookup.city || 'Unknown'}, ${geoipLookup.region || 'Unknown'}, ${geoipLookup.country || 'Unknown'}`;
      if (!geoData.coords) {
        geoData.coords = [geoipLookup.ll[0], geoipLookup.ll[1]];
      }
    }

    geoData.combined = geoData.ipinfo !== 'N/A' ? geoData.ipinfo : geoData.geoip;
  } catch (err) {
    console.warn('Geo lookup failed:', err.message);
  }

  return geoData;
}

// Routes
app.get('/', async (req, res) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';
    const referrer = req.headers['referer'] || req.headers['referrer'] || 'direct';
    const acceptLanguage = req.headers['accept-language'] || 'Unknown';
    const dnt = req.headers['dnt'] === '1' ? 'Yes' : 'No';

    // Skip bots and monitoring services
    if (userAgent.includes('UptimeRobot') || /bot|crawl|spider/i.test(userAgent)) {
      return res.status(204).end();
    }

    // Parse user agent
    const parser = new UAParser(userAgent);
    const device = parser.getDevice();
    const os = parser.getOS();
    const browser = parser.getBrowser();
    const engine = parser.getEngine();
    const cpu = parser.getCPU();
    const deviceType = device.type || 'desktop';

    // Session data
    const sessionData = sessionStarts[ip];
    const sessionDuration = sessionData ? 
      `${((Date.now() - sessionData.startTime) / 1000).toFixed(2)} seconds` : 
      'First visit';
    const pageViews = sessionData ? sessionData.pageViews : 1;

    // Get geo data
    const geoData = await getGeoData(ip);
    const timestamp = formatTimestamp();
    const connectionType = inferConnectionType(req);

    // Prepare email
    const mailOptions = {
      from: '"Website Tracker" <staysane.rz@gmail.com>',
      to: 'xraymundzyron@gmail.com',
      subject: `🚀 ${deviceType === 'mobile' ? '📱 Mobile' : '💻 Desktop'} Visitor - ${ip.substring(0, 15)}...`,
      text: generateEmailText(timestamp, geoData, ip, deviceType, device, os, browser, engine, cpu, connectionType, dnt, referrer, sessionDuration, pageViews, userAgent),
      html: generateEmailHtml(timestamp, geoData, ip, deviceType, device, os, browser, engine, cpu, connectionType, dnt, referrer, sessionDuration, pageViews, userAgent)
    };

    // Send email with retry logic
    try {
      await transporter.sendMail(mailOptions);
      console.log(`Email sent for IP: ${ip}`);
    } catch (error) {
      console.error('Email failed:', error);
      // Implement retry logic here if needed
    }

    // Serve the response
    res.sendFile(__dirname + '/index.html');

  } catch (error) {
    console.error('Request processing error:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Email content generators
function generateEmailText(timestamp, geoData, ip, deviceType, device, os, browser, engine, cpu, connectionType, dnt, referrer, sessionDuration, pageViews, userAgent) {
  return `
=== 🌍 VISITOR DETAILS ===
🕒 Date: ${timestamp.day}, ${timestamp.date}
🕒 Time: ${timestamp.time} (PH Time)
🕒 Unix: ${timestamp.unix}

📍 IP: ${ip}
📍 Location: ${geoData.combined}
📍 Coordinates: ${geoData.coords ? geoData.coords.join(', ') : 'N/A'}
📍 Map: https://www.google.com/maps?q=${geoData.coords ? geoData.coords.join(',') : ''}
📡 ISP: ${geoData.isp}
📡 ASN: ${geoData.asn}

=== 💻 DEVICE INFO ===
📱 Type: ${deviceType}
🏷️ Brand: ${device.vendor || 'Unknown'}
🖥️ Model: ${device.model || 'Unknown'}
💾 OS: ${os.name || 'OS'} ${os.version || ''}
🌐 Browser: ${browser.name || 'Browser'} ${browser.version || ''}
⚙️ Engine: ${engine.name || 'Unknown engine'}
🧠 CPU: ${cpu.architecture || 'Unknown CPU architecture'}

=== 🔗 NETWORK ===
📶 Connection: ${connectionType}
🚫 DNT Header: ${dnt}
🔗 Referrer: ${referrer}

=== 📊 SESSION ===
⏱️ Duration: ${sessionDuration}
📊 Page Views: ${pageViews}

=== 🕵️ USER AGENT ===
${userAgent}
`;
}

function generateEmailHtml(timestamp, geoData, ip, deviceType, device, os, browser, engine, cpu, connectionType, dnt, referrer, sessionDuration, pageViews, userAgent) {
  return `
<div style="font-family: monospace; font-size: 14px; line-height: 1.5;">
  <h2 style="color: #2563eb;">=== 🌍 VISITOR DETAILS ===</h2>
  <p>🕒 <b>Date:</b> ${timestamp.day}, ${timestamp.date}</p>
  <p>🕒 <b>Time:</b> ${timestamp.time} <i>(PH Time)</i></p>
  <p>🕒 <b>Unix:</b> ${timestamp.unix}</p>

  <p>📍 <b>IP:</b> ${ip}</p>
  <p>📍 <b>Location:</b> ${geoData.combined}</p>
  <p>📍 <b>Coordinates:</b> ${geoData.coords ? geoData.coords.join(', ') : 'N/A'}</p>
  <p>📍 <b>Map:</b> <a href="https://www.google.com/maps?q=${geoData.coords ? geoData.coords.join(',') : ''}">View on Google Maps</a></p>
  <p>📡 <b>ISP:</b> ${geoData.isp}</p>
  <p>📡 <b>ASN:</b> ${geoData.asn}</p>

  <h2 style="color: #2563eb;">=== 💻 DEVICE INFO ===</h2>
  <p>📱 <b>Type:</b> ${deviceType}</p>
  <p>🏷️ <b>Brand:</b> ${device.vendor || 'Unknown'}</p>
  <p>🖥️ <b>Model:</b> ${device.model || 'Unknown'}</p>
  <p>💾 <b>OS:</b> ${os.name || 'OS'} ${os.version || ''}</p>
  <p>🌐 <b>Browser:</b> ${browser.name || 'Browser'} ${browser.version || ''}</p>
  <p>⚙️ <b>Engine:</b> ${engine.name || 'Unknown engine'}</p>
  <p>🧠 <b>CPU:</b> ${cpu.architecture || 'Unknown CPU architecture'}</p>

  <h2 style="color: #2563eb;">=== 🔗 NETWORK ===</h2>
  <p>📶 <b>Connection:</b> ${connectionType}</p>
  <p>🚫 <b>DNT Header:</b> ${dnt}</p>
  <p>🔗 <b>Referrer:</b> ${referrer}</p>

  <h2 style="color: #2563eb;">=== 📊 SESSION ===</h2>
  <p>⏱️ <b>Duration:</b> ${sessionDuration}</p>
  <p>📊 <b>Page Views:</b> ${pageViews}</p>

  <h2 style="color: #2563eb;">=== 🕵️ USER AGENT ===</h2>
  <pre>${userAgent}</pre>
</div>
`;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});