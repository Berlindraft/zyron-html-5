const express = require('express');
const nodemailer = require('nodemailer');
const axios = require('axios');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');
const path = require('path');
const app = express();

// Configuration
app.set('trust proxy', true);
const sessionStarts = {};

// Email transporter setup with environment variables
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'staysane.rz@gmail.com',
    pass: process.env.EMAIL_PASS || 'nvkq cudo ibhh usdr',
  },
});

// Verify transporter connection
transporter.verify(function(error, success) {
  if (error) {
    console.error('Error verifying transporter:', error);
  } else {
    console.log('Server is ready to send emails');
  }
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname)); // Serve files from root directory

// Session tracking middleware
app.use((req, res, next) => {
  const ip = req.ip;
  if (!sessionStarts[ip]) {
    sessionStarts[ip] = {
      startTime: Date.now(),
      pageViews: 0,
      fingerprint: req.query.fp || 'unknown'
    };
  }
  sessionStarts[ip].pageViews++;
  next();
});

// Fixed timestamp formatting with Philippine timezone
function formatTimestamp() {
  const options = {
    timeZone: 'Asia/Manila',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  };

  const now = new Date();
  const phTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  
  return {
    iso: now.toISOString(),
    utc: now.toUTCString(),
    local: now.toLocaleString('en-US', options),
    phTime: phTime.toLocaleString('en-US', options),
    timezone: 'Asia/Manila (Philippine Time)',
    timezoneOffset: 'UTC+8',
    unix: Math.floor(now.getTime() / 1000),
    precise: Number(process.hrtime.bigint() / 1000000n)
  };
}

function inferConnectionType(req) {
  const headers = req.headers;
  const ip = req.ip;
  
  if (headers['cf-connecting-ip']) {
    const cfRay = headers['cf-ray'] || '';
    const colo = cfRay.split('-')[1] || 'unknown';
    return `Cloudflare (${colo.toUpperCase()})`;
  }
  
  const proxyHeaders = ['x-forwarded-for', 'via', 'client-ip', 'forwarded'];
  if (proxyHeaders.some(h => headers[h])) {
    return 'Behind Proxy/Load Balancer';
  }
  
  if (ip.startsWith('192.') || ip.startsWith('172.16.') || ip.startsWith('10.')) {
    return 'Likely Mobile (Cellular)';
  }
  
  if (headers['x-tor-ip'] || (headers.host && headers.host.endsWith('.onion'))) {
    return 'Tor Network';
  }
  
  return 'Likely WiFi/Landline';
}

// Routes
app.get('/', async (req, res) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || '';
    const referrer = req.headers['referer'] || req.headers['referrer'] || 'direct';
    const acceptLanguage = req.headers['accept-language'] || 'Unknown';
    const dnt = req.headers['dnt'] === '1' ? 'Yes' : 'No';
    const screenWidth = req.query.width || 'Unknown';
    const screenHeight = req.query.height || 'Unknown';
    const colorDepth = req.query.color || 'Unknown';
    const timezone = req.query.tz || 'Unknown';
    const cookiesEnabled = req.query.cookies === '1' ? 'Enabled' : req.query.cookies === '0' ? 'Disabled' : 'Unknown';
    const fingerprint = req.query.fp ? Buffer.from(req.query.fp, 'base64').toString('utf8') : null;

    const timestamp = formatTimestamp();

    if (userAgent.includes('UptimeRobot')) {
      return res.status(204).end();
    }

    const parser = new UAParser(userAgent);
    const device = parser.getDevice();
    const os = parser.getOS();
    const browser = parser.getBrowser();
    const engine = parser.getEngine();
    const cpu = parser.getCPU();
    const deviceType = device.type || 'desktop';

    const connectionType = inferConnectionType(req);
    const sessionData = sessionStarts[ip];
    const sessionDuration = sessionData ?
      `${((Date.now() - sessionData.startTime) / 1000).toFixed(2)} seconds` :
      'First visit';
    const pageViews = sessionData ? sessionData.pageViews : 1;

    // Geo lookup
    let geoData = {
      ipinfo: 'N/A',
      geoip: 'N/A',
      combined: 'N/A',
      coords: null,
      isp: 'Unknown',
      asn: 'Unknown',
      proxy: 'No'
    };

    try {
      const ipinfoToken = process.env.IPINFO_TOKEN || '5cbabbc7ad7b57';
      const ipinfoResponse = await axios.get(`https://ipinfo.io/${ip}?token=${ipinfoToken}`);
      const { city, region, country, org, loc, hostname, postal, timezone: ipTimezone, asn: ipAsn } = ipinfoResponse.data;

      geoData.ipinfo = `${city || 'Unknown'}, ${region || 'Unknown'}, ${country || 'Unknown'}`;
      geoData.isp = org || 'Unknown';
      geoData.asn = ipAsn?.asn || 'Unknown';
      
      if (hostname) geoData.ipinfo += ` (Hostname: ${hostname})`;
      if (postal) geoData.ipinfo += ` (Postal: ${postal})`;
      if (loc) geoData.coords = loc.split(',');

      const geoipLookup = geoip.lookup(ip);
      if (geoipLookup) {
        geoData.geoip = `${geoipLookup.city || 'Unknown'}, ${geoipLookup.region || 'Unknown'}, ${geoipLookup.country || 'Unknown'}`;
        if (!geoData.coords) geoData.coords = [geoipLookup.ll[0], geoipLookup.ll[1]];
      }

      geoData.combined = geoData.ipinfo !== 'N/A' ? geoData.ipinfo : geoData.geoip;

      const proxyHeaders = ['via', 'x-forwarded-for', 'client-ip', 'forwarded'];
      geoData.proxy = proxyHeaders.some(h => req.headers[h]) ? 'Yes (Proxy headers detected)' : 'No';
      if (ip !== req.connection.remoteAddress) geoData.proxy = 'Yes (IP mismatch)';
    } catch (err) {
      console.warn('Geo lookup failed:', err.message);
    }

    // Device detection
    const isMobile = deviceType === 'mobile' || deviceType === 'tablet';
    const isBot = /bot|crawl|spider|slurp|baidu/i.test(userAgent) ? 'Yes' : 'No';
    const screenResolution = `${screenWidth} × ${screenHeight}`;
    const colorInfo = `${colorDepth}-bit color depth`;
    const languagePrefs = acceptLanguage.split(',').map(lang => lang.split(';')[0]).join(', ');

    // Parse fingerprint data
    let fingerprintData = null;
    try {
      if (fingerprint) fingerprintData = JSON.parse(fingerprint);
    } catch (e) {
      console.warn('Fingerprint parse error:', e.message);
    }

    // Email content
    const mailOptions = {
      from: process.env.EMAIL_USER || 'staysane.rz@gmail.com',
      to: process.env.RECIPIENT_EMAIL || 'xraymundzyron@gmail.com',
      subject: `🚀 ${isMobile ? '📱 Mobile' : '💻 Desktop'} Visitor - ${ip.substring(0, 15)}...`,
      text: `New visit detected!\n\n${generateEmailText(timestamp, geoData, ip, timezone, deviceType, device, screenResolution, colorInfo, os, browser, engine, cpu, isBot, fingerprintData, connectionType, dnt, cookiesEnabled, languagePrefs, referrer, sessionDuration, pageViews, sessionData, userAgent)}`,
      html: `<pre style="font-family: monospace; font-size: 12px; line-height: 1.4;">${generateEmailHtml(timestamp, geoData, ip, timezone, deviceType, device, screenResolution, colorInfo, os, browser, engine, cpu, isBot, fingerprintData, connectionType, dnt, cookiesEnabled, languagePrefs, referrer, sessionDuration, pageViews, sessionData, userAgent)}</pre>`
    };

    // Send email with error handling
    try {
      await transporter.sendMail(mailOptions);
      console.log('Email sent successfully');
    } catch (error) {
      console.error('Email failed:', error);
      if (error.response) {
        console.error('SMTP server response:', error.response);
      }
    }

    // Serve the index.html file directly from root
    res.sendFile(__dirname + '/index.html');

  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/track', (req, res) => {
  res.status(204).end();
});

// Email content generators
function generateEmailText(timestamp, geoData, ip, timezone, deviceType, device, screenResolution, colorInfo, os, browser, engine, cpu, isBot, fingerprintData, connectionType, dnt, cookiesEnabled, languagePrefs, referrer, sessionDuration, pageViews, sessionData, userAgent) {
  return `
=== 🌍 TIMING & LOCATION ===
🕒 UTC Time:     ${timestamp.utc}
🕒 PH Time:      ${timestamp.phTime} (${timestamp.timezone})
🕒 ISO-8601:     ${timestamp.iso}
🕒 Unix Time:    ${timestamp.unix}
🕒 Precise:      ${timestamp.precise} ms
🌐 Timezone:     ${timestamp.timezone}

📍 IP Address:   ${ip}
📍 Location:     ${geoData.combined}
📍 Coordinates:  ${geoData.coords ? geoData.coords.join(', ') : 'N/A'}
📍 Map:          https://www.google.com/maps?q=${geoData.coords ? geoData.coords.join(',') : ''}
📡 ISP:          ${geoData.isp}
📡 ASN:          ${geoData.asn}
🛡️ Proxy/VPN:    ${geoData.proxy}

=== 💻 DEVICE INFO ===
📱 Type:         ${deviceType}
🏷️ Brand:        ${device.vendor || 'Unknown'}
🖥️ Model:        ${device.model || 'Unknown'}
🖥️ Screen:       ${screenResolution} (${colorInfo})
💾 OS:           ${os.name || 'OS'} ${os.version || ''}
🌐 Browser:      ${browser.name || 'Browser'} ${browser.version || ''}
⚙️ Engine:       ${engine.name || 'Unknown engine'}
🧠 CPU:          ${cpu.architecture || 'Unknown CPU architecture'}
🤖 Bot:          ${isBot}

=== 🔍 FINGERPRINT ===
🖌️ Canvas:       ${fingerprintData?.canvas ? 'Present' : 'No'}
🎮 WebGL:        ${fingerprintData?.webgl ? (typeof fingerprintData.webgl === 'string' ? fingerprintData.webgl : 'Vendor: ' + fingerprintData.webgl.vendor) : 'No'}
🎧 Audio:        ${fingerprintData?.audio ? fingerprintData.audio + ' chars' : 'No'}
🧩 Plugins:      ${fingerprintData?.plugins ? fingerprintData.plugins.split('|').length + ' plugins' : 'No'}
✒️ Fonts:        ${fingerprintData?.fonts ? fingerprintData.fonts.split(',').length + ' fonts' : 'No'}
👆 Touch:        ${fingerprintData?.touch ? 'Supported' : 'No'}
⚙️ Hardware:     ${fingerprintData?.hardware ? `${fingerprintData.hardware.cores} cores, ${fingerprintData.hardware.memory}GB RAM` : 'No'}

=== 🔗 NETWORK & PRIVACY ===
📶 Connection:   ${connectionType}
🚫 DNT Header:   ${dnt} (Do Not Track)
🍪 Cookies:      ${cookiesEnabled}
🗣️ Languages:    ${languagePrefs}
🔗 Referrer:     ${referrer}

=== 📊 SESSION ===
⏱️ Duration:     ${sessionDuration}
📊 Page Views:   ${pageViews}
👾 Fingerprint:  ${sessionData?.fingerprint || 'unknown'}

=== 🕵️ USER AGENT ===
${userAgent}
`;
}

function generateEmailHtml(timestamp, geoData, ip, timezone, deviceType, device, screenResolution, colorInfo, os, browser, engine, cpu, isBot, fingerprintData, connectionType, dnt, cookiesEnabled, languagePrefs, referrer, sessionDuration, pageViews, sessionData, userAgent) {
  return `
<b>=== 🌍 TIMING & LOCATION ===</b>
🕒 <b>UTC Time:</b>     ${timestamp.utc}
🕒 <b>PH Time:</b>      ${timestamp.phTime} <i>(${timestamp.timezone})</i>
🕒 <b>ISO-8601:</b>     ${timestamp.iso}
🕒 <b>Unix Time:</b>    ${timestamp.unix}
🕒 <b>Precise:</b>      ${timestamp.precise} ms
🌐 <b>Timezone:</b>     ${timestamp.timezone}

📍 <b>IP Address:</b>   ${ip}
📍 <b>Location:</b>     ${geoData.combined}
📍 <b>Coordinates:</b>  ${geoData.coords ? geoData.coords.join(', ') : 'N/A'}
📍 <b>Map:</b>          <a href="https://www.google.com/maps?q=${geoData.coords ? geoData.coords.join(',') : ''}">Google Maps</a>
📡 <b>ISP:</b>          ${geoData.isp}
📡 <b>ASN:</b>          ${geoData.asn}
🛡️ <b>Proxy/VPN:</b>    ${geoData.proxy}

<b>=== 💻 DEVICE INFO ===</b>
📱 <b>Type:</b>         ${deviceType}
🏷️ <b>Brand:</b>        ${device.vendor || 'Unknown'}
🖥️ <b>Model:</b>        ${device.model || 'Unknown'}
🖥️ <b>Screen:</b>       ${screenResolution} (${colorInfo})
💾 <b>OS:</b>           ${os.name || 'OS'} ${os.version || ''}
🌐 <b>Browser:</b>      ${browser.name || 'Browser'} ${browser.version || ''}
⚙️ <b>Engine:</b>       ${engine.name || 'Unknown engine'}
🧠 <b>CPU:</b>          ${cpu.architecture || 'Unknown CPU architecture'}
🤖 <b>Bot:</b>          ${isBot}

<b>=== 🔍 FINGERPRINT ===</b>
🖌️ <b>Canvas:</b>       ${fingerprintData?.canvas ? 'Present' : 'No'}
🎮 <b>WebGL:</b>        ${fingerprintData?.webgl ? (typeof fingerprintData.webgl === 'string' ? fingerprintData.webgl : 'Vendor: ' + fingerprintData.webgl.vendor) : 'No'}
🎧 <b>Audio:</b>        ${fingerprintData?.audio ? fingerprintData.audio + ' chars' : 'No'}
🧩 <b>Plugins:</b>      ${fingerprintData?.plugins ? fingerprintData.plugins.split('|').length + ' plugins' : 'No'}
✒️ <b>Fonts:</b>        ${fingerprintData?.fonts ? fingerprintData.fonts.split(',').length + ' fonts' : 'No'}
👆 <b>Touch:</b>        ${fingerprintData?.touch ? 'Supported' : 'No'}
⚙️ <b>Hardware:</b>     ${fingerprintData?.hardware ? `${fingerprintData.hardware.cores} cores, ${fingerprintData.hardware.memory}GB RAM` : 'No'}

<b>=== 🔗 NETWORK & PRIVACY ===</b>
📶 <b>Connection:</b>   ${connectionType}
🚫 <b>DNT Header:</b>   ${dnt} (Do Not Track)
🍪 <b>Cookies:</b>      ${cookiesEnabled}
🗣️ <b>Languages:</b>    ${languagePrefs}
🔗 <b>Referrer:</b>     ${referrer}

<b>=== 📊 SESSION ===</b>
⏱️ <b>Duration:</b>     ${sessionDuration}
📊 <b>Page Views:</b>   ${pageViews}
👾 <b>Fingerprint:</b>  ${sessionData?.fingerprint || 'unknown'}

<b>=== 🕵️ USER AGENT ===</b>
${userAgent}
`;
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tracker running on port ${PORT}`));