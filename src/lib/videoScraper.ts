export interface ExtractVideoResult {
  success: boolean;
  source_webpage: string;
  direct_url?: string;
  error?: string;
}

/**
 * Sends webpage URL(s) to the backend serverless resolver endpoint to scrape and extract
 * the raw video stream source (.mp4, .m3u8, CDN video URL).
 */
export async function extractVideoFromWebpage(pageUrls: string[]): Promise<ExtractVideoResult[]> {
  const cleanUrls = pageUrls.map((u) => u.trim()).filter((u) => u.length > 0);
  if (cleanUrls.length === 0) return [];

  try {
    const response = await fetch('/api/extract-video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ urls: cleanUrls }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server returned HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.results || [];
  } catch (err: any) {
    console.warn('Backend extract-video API call notice:', err);

    // Fallback resolution: Check if the provided URLs are direct video links
    return cleanUrls.map((url) => {
      const clean = url.split('?')[0].split('#')[0].toLowerCase();
      if (
        clean.endsWith('.mp4') ||
        clean.endsWith('.m3u8') ||
        clean.endsWith('.webm') ||
        clean.endsWith('.mpd') ||
        clean.endsWith('.mov') ||
        clean.endsWith('.flv') ||
        clean.endsWith('.ts')
      ) {
        return {
          success: true,
          source_webpage: url,
          direct_url: url,
        };
      }
      return {
        success: false,
        source_webpage: url,
        error: `Could not extract video stream from webpage (${err?.message || 'Scraper endpoint unreachable'})`,
      };
    });
  }
}
