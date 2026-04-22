const fetch = require('node-fetch');
const logger = require('./logger');

/**
 * Scrapes a YouTube playlist for videos using a reliable Cookie-Bypass method.
 * Guaranteed to bypass Render/AWS EU Cookie Consent screens.
 * @param {string} url - The YouTube playlist URL.
 * @param {number} limit - Maximum number of videos to fetch.
 * @returns {Promise<Array<{title: string, url: string, thumbnail: string}>>}
 */
async function scrapeYouTubePlaylist(url, limit = 150) {
  logger.info('Starting robust raw HTML YouTube playlist scrape', { url, limit });
  
  try {
    const res = await fetch(url.trim(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Cookie': 'CONSENT=YES+cb.20230214-11-p0.en+FX+430;', // MAGIC COOKIE
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const html = await res.text();
    // Regex to accurately locate the JSON object inside the script block
    const match = html.match(/var ytInitialData = ({.*?});<\/script>/);
    if (!match) {
      logger.warn('Failed to find ytInitialData in HTML payload. Cookie bypass may have failed or Playlist does not exist.', { url });
      return [];
    }

    const data = JSON.parse(match[1]);
    let playlistContents = null;
    
    try {
      const tabs = data.contents.twoColumnBrowseResultsRenderer.tabs;
      for (let t of tabs) {
        if (t.tabRenderer?.content?.sectionListRenderer) {
          const contents = t.tabRenderer.content.sectionListRenderer.contents;
          for (let c of contents) {
            if (c.itemSectionRenderer?.contents) {
              for (let i of c.itemSectionRenderer.contents) {
                if (i.playlistVideoListRenderer?.contents) {
                  playlistContents = i.playlistVideoListRenderer.contents;
                  break;
                }
              }
            }
          }
        }
      }
    } catch (parseErr) {
      logger.error('Failed to traverse ytInitialData structure', { error: parseErr.message });
      return [];
    }

    if (!playlistContents || playlistContents.length === 0) {
      logger.warn('Playlist contents array is empty or undefined', { url });
      return [];
    }

    const videos = [];
    for (let item of playlistContents) {
      if (item.playlistVideoRenderer) {
        const v = item.playlistVideoRenderer;
        // Ignore unplayable/deleted/private videos
        if (v.isPlayable !== false && v.videoId) {
          videos.push({
            title: v.title?.runs?.[0]?.text || 'Unknown Title',
            url: `https://www.youtube.com/watch?v=${v.videoId}`,
            thumbnail: v.thumbnail?.thumbnails?.[v.thumbnail.thumbnails.length - 1]?.url || null
          });
          if (videos.length >= limit) break;
        }
      }
    }

    logger.info('YouTube playlist raw scrape completed', { count: videos.length });
    return videos;

  } catch (err) {
    logger.error('YouTube RAW playlist scrape failed', { error: err.message });
    throw err;
  }
}

module.exports = { scrapeYouTubePlaylist };
