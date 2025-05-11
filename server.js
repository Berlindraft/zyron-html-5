require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const axios = require('axios');
const UAParser = require('ua-parser-js');
const app = express();

// Configuration
app.set('trust proxy', true);
const sessionStarts = {};
const API_KEYS = {
  IPGEOLOCATION: process.env.IPGEOLOCATION_KEY || '9f3379077de64d18b8a46cfbb7117166',
  ABUSEIPDB: process.env.ABUSEIPDB_KEY || '9b41c21b1406700b28f1d8eb09983c526c6175f840feea6f5a2c694dcd40a701773b3a756b2f4625'
};

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'staysane.rz@gmail.com',
    pass: process.env.EMAIL_PASS || 'nvkq cudo ibhh usdr'
  }
});

// Middleware
app.use((req, res, next) => {
  const ip = req.ip;
  if (!sessionStarts[ip]) sessionStarts[ip] = new Date();
  next();
});

// Helper functions
const formatDate = (date) => ({
  day: date.toLocaleString('en-US', { weekday: 'long' }),
  date: date.toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  time: date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
});

const inferConnectionType = (req) => {
  const ip = req.ip;
  if (ip.startsWith('192.168.') || ip.startsWith('172.16.') || ip.startsWith('10.')) {
    return 'Likely Mobile or Behind NAT';
  }
  return req.headers['cf-connecting-ip'] ? 'Behind Cloudflare' : 'Likely WiFi/Landline';
};

// API Data Fetching
const fetchGeoData = async (ip) => {
  const data = { freegeoip: null, ipgeolocation: null };
  
  try {
    const freeGeoRes = await axios.get(`https://freegeoip.app/json/${ip}`);
    data.freegeoip = {
      location: `${freeGeoRes.data.city || 'Unknown'}, ${freeGeoRes.data.region_name || 'Unknown'}, ${freeGeoRes.data.country_name || 'Unknown'}`,
      coords: { lat: freeGeoRes.data.latitude, lon: freeGeoRes.data.longitude },
      isp: freeGeoRes.data.metro_code ? `Metro Code: ${freeGeoRes.data.metro_code}` : 'Unknown ISP',
      timezone: freeGeoRes.data.time_zone || 'N/A'
    };
  } catch (err) {
    console.warn('FreeGeoIP error:', err.message);
  }

  try {
    const ipGeoRes = await axios.get(`https://api.ipgeolocation.io/ipgeo?apiKey=${API_KEYS.IPGEOLOCATION}&ip=${ip}`);
    data.ipgeolocation = {
      location: `${ipGeoRes.data.city || 'Unknown'}, ${ipGeoRes.data.state_prov || 'Unknown'}, ${ipGeoRes.data.country_name || 'Unknown'}`,
      coords: { lat: ipGeoRes.data.latitude, lon: ipGeoRes.data.longitude },
      isp: ipGeoRes.data.isp || 'Unknown ISP',
      isProxy: ipGeoRes.data.is_proxy || false,
      organization: ipGeoRes.data.organization || 'N/A'
    };
  } catch (err) {
    console.warn('IPGeolocation error:', err.message);
  }

  return data;
};

const fetchThreatData = async (ip) => {
  try {
    const res = await axios.get(`https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}`, {
      headers: { 'Key': API_KEYS.ABUSEIPDB }
    });
    return {
      isPublic: res.data.data.isPublic,
      abuseConfidence: res.data.data.abuseConfidenceScore,
      isTor: res.data.data.isTor,
      isProxy: res.data.data.isProxy,
      lastReported: res.data.data.lastReportedAt || 'Never'
    };
  } catch (err) {
    console.warn('AbuseIPDB error:', err.message);
    return null;
  }
};

// Main route
app.get('/', async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';
  const referrer = req.headers['referer'] || req.headers['referrer'] || 'direct';

  // Skip bots
  if (/UptimeRobot|pingbot|bot|spider|crawl/i.test(userAgent)) {
    return res.status(204).end();
  }

  // Parse basic info
  const timestamp = new Date();
  const { day, date, time } = formatDate(timestamp);
  const parser = new UAParser(userAgent);
  const { type: deviceType, vendor: deviceVendor, model: deviceModel } = parser.getDevice();
  const { name: osName, version: osVersion } = parser.getOS();
  const { name: browserName, version: browserVersion } = parser.getBrowser();
  const sessionStart = sessionStarts[ip];
  const sessionDuration = sessionStart ? `${Math.round((new Date() - sessionStart) / 1000)}s` : 'First visit';

  // Fetch enhanced data
  const [geoData, threatData] = await Promise.all([
    fetchGeoData(ip),
    fetchThreatData(ip)
  ]);

  // Determine best available location
  const bestLocation = geoData.ipgeolocation?.location || geoData.freegeoip?.location || 'Unknown Location';
  const bestCoords = geoData.ipgeolocation?.coords || geoData.freegeoip?.coords || { lat: null, lon: null };
  const bestIsp = geoData.ipgeolocation?.isp || geoData.freegeoip?.isp || 'Unknown ISP';

  // Prepare email
  const mailOptions = {
    from: 'Website Tracker <staysane.rz@gmail.com>',
    to: 'xraymundzyron@gmail.com',
    subject: `New Visitor: ${bestLocation.split(',')[0]}`,
    html: buildEmailTemplate({
      timestamp: { day, date, time },
      ipInfo: {
        address: ip,
        connection: inferConnectionType(req),
        isp: bestIsp,
        location: bestLocation,
        coords: bestCoords,
        timezone: geoData.freegeoip?.timezone
      },
      deviceInfo: {
        type: deviceType || 'Unknown',
        vendor: deviceVendor || 'Unknown',
        model: deviceModel || 'Unknown',
        os: `${osName || 'OS'} ${osVersion || ''}`,
        browser: `${browserName || 'Browser'} ${browserVersion || ''}`
      },
      sessionInfo: {
        duration: sessionDuration,
        referrer: referrer,
        userAgent: userAgent
      },
      threatInfo: threatData || {
        isPublic: 'N/A',
        abuseConfidence: 'N/A',
        isTor: 'N/A',
        isProxy: 'N/A',
        lastReported: 'N/A'
      }
    })
  };

  // Send email (async)
  transporter.sendMail(mailOptions)
    .then(info => console.log('Email sent:', info.messageId))
    .catch(err => console.error('Email failed:', err));

  // Serve website
  res.sendFile(__dirname + '/index.html');
});

// Email template builder
const buildEmailTemplate = (data) => {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
    .section { margin-bottom: 20px; padding: 15px; background: #f9f9f9; border-radius: 5px; }
    .label { font-weight: bold; color: #3498db; }
    .threat-high { color: #e74c3c; font-weight: bold; }
    .threat-medium { color: #f39c12; font-weight: bold; }
    .threat-low { color: #2ecc71; font-weight: bold; }
    .map-link { color: #3498db; text-decoration: none; }
    .map-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🚀 New Website Visitor</h1>
    <p>${data.timestamp.day}, ${data.timestamp.date} at ${data.timestamp.time}</p>
  </div>

  <div class="section">
    <h2>📍 Location Information</h2>
    <p><span class="label">IP Address:</span> ${data.ipInfo.address}</p>
    <p><span class="label">Location:</span> ${data.ipInfo.location}</p>
    <p><span class="label">Coordinates:</span> ${data.ipInfo.coords.lat || 'N/A'}, ${data.ipInfo.coords.lon || 'N/A'}</p>
    ${data.ipInfo.coords.lat ? `<a href="https://maps.google.com?q=${data.ipInfo.coords.lat},${data.ipInfo.coords.lon}" class="map-link">View on Google Maps</a>` : ''}
    <p><span class="label">ISP:</span> ${data.ipInfo.isp}</p>
    <p><span class="label">Timezone:</span> ${data.ipInfo.timezone || 'N/A'}</p>
    <p><span class="label">Connection Type:</span> ${data.ipInfo.connection}</p>
  </div>

  <div class="section">
    <h2>📱 Device Information</h2>
    <p><span class="label">Device Type:</span> ${data.deviceInfo.type}</p>
    <p><span class="label">Vendor/Model:</span> ${data.deviceInfo.vendor} ${data.deviceInfo.model}</p>
    <p><span class="label">Operating System:</span> ${data.deviceInfo.os}</p>
    <p><span class="label">Browser:</span> ${data.deviceInfo.browser}</p>
  </div>

  <div class="section">
    <h2>⚠️ Threat Analysis</h2>
    <p><span class="label">Public IP:</span> ${data.threatInfo.isPublic}</p>
    <p><span class="label">Abuse Confidence:</span> 
      <span class="${
        data.threatInfo.abuseConfidence > 70 ? 'threat-high' : 
        data.threatInfo.abuseConfidence > 30 ? 'threat-medium' : 'threat-low'
      }">
        ${data.threatInfo.abuseConfidence}%
      </span>
    </p>
    <p><span class="label">Tor Network:</span> ${data.threatInfo.isTor}</p>
    <p><span class="label">Proxy/VPN:</span> ${data.threatInfo.isProxy}</p>
    <p><span class="label">Last Reported:</span> ${data.threatInfo.lastReported}</p>
  </div>

  <div class="section">
    <h2>📊 Session Information</h2>
    <p><span class="label">Session Duration:</span> ${data.sessionInfo.duration}</p>
    <p><span class="label">Referrer:</span> ${data.sessionInfo.referrer}</p>
    <p><span class="label">User Agent:</span> ${data.sessionInfo.userAgent}</p>
  </div>

  <footer style="margin-top: 20px; text-align: center; color: #7f8c8d; font-size: 0.9em;">
    <p>This notification was generated automatically</p>
    <p>${new Date().toLocaleString()}</p>
  </footer>
</body>
</html>`;
};

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  
  const errorMail = {
    from: 'Website Tracker Error <staysane.rz@gmail.com>',
    to: 'xraymundzyron@gmail.com',
    subject: 'Tracker Error Occurred',
    text: `Error: ${err.message}\n\nStack: ${err.stack}\n\nRequest Info:\nIP: ${req.ip}\nURL: ${req.originalUrl}\nUser Agent: ${req.headers['user-agent']}`
  };
  
  transporter.sendMail(errorMail);
  res.status(500).send('Internal Server Error');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tracker running on port ${PORT}`));