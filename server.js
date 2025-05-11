const express = require('express');
const nodemailer = require('nodemailer');
const axios = require('axios');
const UAParser = require('ua-parser-js');
const path = require('path');

const app = express();
app.set('trust proxy', true);

// Configuration (HARD-CODED)
const sessionStarts = {};
const EMAIL_USER = 'staysane.rz@gmail.com';
const EMAIL_PASS = 'nvkqcudoibhhusdr';
const EMAIL_TO = 'xraymundzyron@gmail.com';
const IPGEOLOCATION_KEY = '9f3379077de64d18b8a46cfbb7117166';
const ABUSEIPDB_KEY = '9b41c21b1406700b28f1d8eb09983c526c6175f840feea6f5a2c694dcd40a701773b3a756b2f4625';

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: EMAIL_USER, pass: EMAIL_PASS }
});

// Middleware to track session start
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

// API data
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
    const ipGeoRes = await axios.get(`https://api.ipgeolocation.io/ipgeo?apiKey=${IPGEOLOCATION_KEY}&ip=${ip}`);
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
      headers: { 'Key': ABUSEIPDB_KEY }
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

// Email template builder
const buildEmailTemplate = (data) => {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body { font-family: Arial; padding: 20px; max-width: 800px; margin: auto; }
    h2 { color: #2c3e50; border-bottom: 1px solid #ccc; }
    .label { font-weight: bold; }
    .threat-high { color: red; font-weight: bold; }
    .threat-medium { color: orange; font-weight: bold; }
    .threat-low { color: green; font-weight: bold; }
  </style></head><body>
  <h1>🚀 New Website Visitor</h1>
  <p>${data.timestamp.day}, ${data.timestamp.date} at ${data.timestamp.time}</p>

  <h2>📍 Location Info</h2>
  <p><span class="label">IP:</span> ${data.ipInfo.address}</p>
  <p><span class="label">Location:</span> ${data.ipInfo.location}</p>
  <p><span class="label">Coordinates:</span> ${data.ipInfo.coords.lat}, ${data.ipInfo.coords.lon}</p>
  <p><span class="label">ISP:</span> ${data.ipInfo.isp}</p>
  <p><span class="label">Timezone:</span> ${data.ipInfo.timezone}</p>
  <p><span class="label">Connection:</span> ${data.ipInfo.connection}</p>

  <h2>📱 Device Info</h2>
  <p><span class="label">Device:</span> ${data.deviceInfo.type} (${data.deviceInfo.vendor} ${data.deviceInfo.model})</p>
  <p><span class="label">OS:</span> ${data.deviceInfo.os}</p>
  <p><span class="label">Browser:</span> ${data.deviceInfo.browser}</p>

  <h2>⚠️ Threat Analysis</h2>
  <p><span class="label">Public:</span> ${data.threatInfo.isPublic}</p>
  <p><span class="label">Abuse Confidence:</span> 
    <span class="${
      data.threatInfo.abuseConfidence > 70 ? 'threat-high' :
      data.threatInfo.abuseConfidence > 30 ? 'threat-medium' : 'threat-low'
    }">${data.threatInfo.abuseConfidence}%</span>
  </p>
  <p><span class="label">Tor:</span> ${data.threatInfo.isTor}</p>
  <p><span class="label">Proxy:</span> ${data.threatInfo.isProxy}</p>
  <p><span class="label">Last Reported:</span> ${data.threatInfo.lastReported}</p>

  <h2>📊 Session</h2>
  <p><span class="label">Duration:</span> ${data.sessionInfo.duration}</p>
  <p><span class="label">Referrer:</span> ${data.sessionInfo.referrer}</p>
  <p><span class="label">User Agent:</span> ${data.sessionInfo.userAgent}</p>

  <p style="text-align:center;margin-top:30px;color:#999;">Report generated at ${new Date().toLocaleString()}</p>
  </body></html>`;
};

// Main route
app.get('/', async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'] || '';
  const referrer = req.headers['referer'] || req.headers['referrer'] || 'direct';

  if (/UptimeRobot|pingbot|bot|spider|crawl/i.test(userAgent)) {
    return res.status(204).end();
  }

  const timestamp = new Date();
  const { day, date, time } = formatDate(timestamp);
  const parser = new UAParser(userAgent);
  const { type, vendor, model } = parser.getDevice();
  const { name: osName, version: osVersion } = parser.getOS();
  const { name: browserName, version: browserVersion } = parser.getBrowser();
  const sessionStart = sessionStarts[ip];
  const sessionDuration = sessionStart ? `${Math.round((new Date() - sessionStart) / 1000)}s` : 'First visit';

  const [geoData, threatData] = await Promise.all([fetchGeoData(ip), fetchThreatData(ip)]);
  const bestLocation = geoData.ipgeolocation?.location || geoData.freegeoip?.location || 'Unknown';
  const bestCoords = geoData.ipgeolocation?.coords || geoData.freegeoip?.coords || { lat: 'N/A', lon: 'N/A' };
  const bestIsp = geoData.ipgeolocation?.isp || geoData.freegeoip?.isp || 'Unknown';

  const mailOptions = {
    from: `Tracker <${EMAIL_USER}>`,
    to: EMAIL_TO,
    subject: `New Visitor: ${bestLocation.split(',')[0]}`,
    html: buildEmailTemplate({
      timestamp: { day, date, time },
      ipInfo: {
        address: ip,
        connection: inferConnectionType(req),
        isp: bestIsp,
        location: bestLocation,
        coords: bestCoords,
        timezone: geoData.freegeoip?.timezone || 'N/A'
      },
      deviceInfo: {
        type: type || 'Unknown',
        vendor: vendor || 'Unknown',
        model: model || 'Unknown',
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
        abuseConfidence: 0,
        isTor: 'N/A',
        isProxy: 'N/A',
        lastReported: 'N/A'
      }
    })
  };

  transporter.sendMail(mailOptions)
    .then(info => console.log('Email sent:', info.messageId))
    .catch(err => console.error('Email error:', err));

  res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).send('Something broke!');
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Tracker running on http://localhost:${PORT}`));
