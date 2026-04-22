const { Innertube, UniversalCache } = require('youtubei.js');
const logger = require('../utils/logger');

// [v105.5] PERFORMANCE OPTIMIZATION: Singleton YouTube Instance
let ytInstance = null;
let lastUsedCookie = null;

async function getYTInstance() {
  const currentCookie = process.env.YT_COOKIES || '';
  
  // Re-initialize if instance doesn't exist OR cookies have changed
  if (!ytInstance || lastUsedCookie !== currentCookie) {
    logger.info('[MEDIA] Initializing New YouTube Singleton Instance');
    ytInstance = await Innertube.create({
      cookie: currentCookie,
      cache: new UniversalCache(false),
      generate_session_locally: true
    });
    lastUsedCookie = currentCookie;
  }
  return ytInstance;
}

// [v106.5] BULLETPROOF LOGIC (Android Walkman + Smart Fallback)
async function downloadYouTube(req, res) {
  try {
    const { url, title, check } = req.query;
    if (!url) return res.status(400).json({ success: false, error: 'URL is required' });

    const yt = await getYTInstance();
    const videoId = url.split('v=')[1]?.split('&')[0] || url.split('/').pop()?.split('?')[0];

    // [FAST PING] If frontend just wants to check availability
    if (check === 'true') {
      return res.status(200).json({ success: true, message: 'Server Reachable' });
    }
    
    // 1. Try to get info with high-privacy/low-restriction clients
    let info;
    const clients = ['ANDROID_WALKMAN', 'TVHTML5', 'WEB'];
    let lastErr = null;

    for (const clientName of clients) {
      try {
        logger.info(`[MEDIA] Attempting Client: ${clientName}`);
        info = await yt.getInfo(videoId, clientName);
        if (info && info.streaming_data) break; // Success!
      } catch (e) {
        lastErr = e;
        logger.warn(`[MEDIA] Client ${clientName} failed`, { error: e.message });
      }
    }

    // 2. If info found, select format and stream
    if (info && info.streaming_data) {
      const format = info.chooseFormat({ type: 'video', quality: 'best', format: 'mp4' });
      
      if (format) {
        const cleanTitle = (title || info.basic_info.title || 'video').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${cleanTitle}.mp4"`);
        if (format.content_length) res.setHeader('Content-Length', format.content_length);

        const stream = await info.download({ format });
        const reader = stream.getReader();
        while(true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        return res.end();
      }
    }

    // 3. SMART FALLBACK: If we reach here, Render is 100% blocked for this video.
    logger.error('[MEDIA] All local proxy attempts blocked. Triggering Smart Fallback.');
    
    // Fallback: Using a more universal gateway (y2mate) which is less prone to ISP blocks
    const fallbackUrl = `https://y2mate.is/watch?v=${videoId}`;
    
    return res.status(200).json({ 
      success: true, 
      fallback: true,
      url: fallbackUrl,
      message: 'Processing via secure gateway...'
    });

  } catch (err) {
    logger.error('[MEDIA] Bulletproof System Error', { error: err.message });
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Service temporarily overloaded. Try again later.' });
    }
  }
}

// [v104.2] PDF PROXY (Optional: for cases where CORS prevents direct download)
async function downloadPDF(req, res) {
  try {
    const { url, title } = req.query;
    if (!url) return res.status(400).send('URL required');

    // [v107.9] Restored Google Drive Resolution + Streaming Proxy
    let downloadUrl = url;
    if (url.includes('drive.google.com')) {
      const fileId = url.match(/[-\w]{25,}/);
      if (fileId) {
        downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId[0]}`;
      }
    }

    const fetch = require('node-fetch');
    try {
        const response = await fetch(downloadUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000 // 10s cutoff
        });

        if (!response.ok) throw new Error(`Source failed: ${response.status}`);

        const cleanTitle = (title || 'document').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
        res.setHeader('Content-Type', response.headers.get('content-type') || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${cleanTitle}.pdf"`);
        
        // Stream to client
        response.body.pipe(res);
    } catch (streamErr) {
        logger.warn('[MEDIA] PDF Streaming failed, falling back to redirect', { url: downloadUrl, error: streamErr.message });
        // Failsafe: Best-effort redirect to the direct uc link
        return res.redirect(downloadUrl);
    }

  } catch (err) {
    res.status(500).send('Download failed');
  }
}

module.exports = {
  downloadYouTube,
  downloadPDF
};
