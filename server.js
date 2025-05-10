const express = require('express');
const nodemailer = require('nodemailer');
const app = express();

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'staysane.rz@gmail.com',
    pass: process.env.EMAIL_PASS || 'nvkq cudo ibhh usdr'
  }
});

// Track all visits to the root URL
app.get('/', (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];
  const referrer = req.headers['referer'] || 'direct';
  const timestamp = new Date().toISOString();

  console.log(`Visit from IP: ${ip}`);

  // Send email notification
  const mailOptions = {
    from: 'staysane.rz@gmail.com',
    to: 'xraymundzyron@gmail.com',
    subject: 'Visitor accessed your URL',
    text: `New visit detected!\n
           Timestamp: ${timestamp}\n
           IP Address: ${ip}\n
           User Agent: ${userAgent}\n
           Referrer: ${referrer}`
  };

  transporter.sendMail(mailOptions, (error) => {
    if (error) console.error('Email failed:', error);
  });

  // Immediately redirect to your actual destination
        res.sendFile(__dirname + '/index.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tracker running on port ${PORT}`));