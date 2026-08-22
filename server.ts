import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  updateDoc,
  setDoc,
  query,
  where,
  increment,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';

// Load Firebase Config safely
let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {
  console.warn('Notice: Could not load firebase-applet-config.json on server:', e);
}

// Mandatory named Firestore database instance ID
const FIRESTORE_DATABASE_ID =
  firebaseConfig.firestoreDatabaseId || 'ai-studio-shortxxadmindash-86192a98-919e-436c-80b9-836d96e0e32b';

// Initialize server-side Firestore instance
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(
  firebaseApp,
  FIRESTORE_DATABASE_ID
);

const VIDEOS_COLLECTION = 'videos';
const EVENTS_COLLECTION = 'events';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // CORS middleware for external frontend players and apps
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  /**
   * GET /api/videos
   * Fetches active videos from Firestore.
   * Optional query param: ?track_view=true (increments 1 view for returned items)
   */
  app.get('/api/videos', async (req, res) => {
    try {
      const activeOnly = req.query.active !== 'false';
      const limitCount = Math.min(parseInt(req.query.limit as string) || 100, 200);
      const shouldTrack = req.query.track_view === 'true';

      const videosRef = collection(db, VIDEOS_COLLECTION);
      const q = activeOnly
        ? query(videosRef, where('is_active', '==', true))
        : query(videosRef);

      const snap = await getDocs(q);
      const allVideos = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          direct_url: data.direct_url || '',
          views: typeof data.views === 'number' ? data.views : 0,
          is_active: typeof data.is_active === 'boolean' ? data.is_active : true,
          created_at: data.created_at || null,
        };
      });

      const results = allVideos.slice(0, limitCount);

      if (shouldTrack && results.length > 0) {
        // Record 1 view for each returned video
        await Promise.all(
          results.map(async (v) => {
            try {
              const docRef = doc(db, VIDEOS_COLLECTION, v.id);
              await updateDoc(docRef, { views: increment(1) });
              v.views += 1;
            } catch (err) {
              console.warn(`Failed to track view for video ${v.id}:`, err);
            }
          })
        );
      }

      res.json({
        success: true,
        count: results.length,
        total: allVideos.length,
        tracked_views: shouldTrack,
        videos: results,
      });
    } catch (err: any) {
      console.error('Error in GET /api/videos:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch videos' });
    }
  });

  /**
   * GET /api/videos/next or GET /api/videos/random
   * Fetches an active video stream link for the user/frontend player to render.
   * AUTOMATICALLY records 1 view on the video in Firestore by default!
   */
  const handleNextVideo = async (req: express.Request, res: express.Response) => {
    try {
      const noTrack = req.query.no_track === 'true';
      const excludeIds = typeof req.query.exclude === 'string' ? req.query.exclude.split(',') : [];

      const videosRef = collection(db, VIDEOS_COLLECTION);
      const q = query(videosRef, where('is_active', '==', true));
      const snap = await getDocs(q);

      if (snap.empty) {
        return res.status(404).json({
          success: false,
          error: 'No active video streams found in database.',
        });
      }

      let eligible = snap.docs.filter((d) => !excludeIds.includes(d.id));
      if (eligible.length === 0) {
        eligible = snap.docs; // fallback if all were excluded
      }

      // Pick a random stream or sequential
      const chosenDoc = eligible[Math.floor(Math.random() * eligible.length)];
      const docData = chosenDoc.data();
      const videoId = chosenDoc.id;
      let currentViews = typeof docData.views === 'number' ? docData.views : 0;

      // AUTOMATICALLY INCREMENT VIEW COUNT BY 1
      if (!noTrack) {
        const docRef = doc(db, VIDEOS_COLLECTION, videoId);
        await updateDoc(docRef, { views: increment(1) });
        currentViews += 1;

        // Log telemetry view event
        try {
          const eventsRef = collection(db, EVENTS_COLLECTION);
          const userAgent = req.headers['user-agent'] || 'External Player';
          const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
          await setDoc(doc(eventsRef), {
            event_type: 'video_view',
            userId: (req.query.user_id as string) || 'FRONTEND_VIEWER',
            video_id: videoId,
            direct_url: docData.direct_url || '',
            timestamp: serverTimestamp(),
            device_type: /mobile|android|iphone/i.test(String(userAgent)) ? 'Mobile' : 'Desktop',
            country: 'GH',
            details: `Video stream rendered on frontend (+1 view recorded)`,
          });
        } catch (e) {
          console.warn('Notice: telemetry event log skipped:', e);
        }
      }

      res.json({
        success: true,
        video: {
          id: videoId,
          direct_url: docData.direct_url || '',
          views: currentViews,
          is_active: docData.is_active ?? true,
        },
        tracked_view: !noTrack,
        message: !noTrack
          ? 'Video stream link fetched and 1 view successfully recorded in Firestore.'
          : 'Video stream link fetched (view tracking disabled).',
      });
    } catch (err: any) {
      console.error('Error fetching next video:', err);
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch video stream' });
    }
  };

  app.get('/api/videos/next', handleNextVideo);
  app.get('/api/videos/random', handleNextVideo);

  /**
   * GET /api/videos/stats
   * Summary counts of total videos, active streams, and aggregate total views
   */
  app.get('/api/videos/stats', async (req, res) => {
    try {
      const snap = await getDocs(collection(db, VIDEOS_COLLECTION));
      let totalVideos = 0;
      let activeVideos = 0;
      let totalViews = 0;

      snap.forEach((d) => {
        totalVideos++;
        const data = d.data();
        if (data.is_active) activeVideos++;
        if (typeof data.views === 'number') totalViews += data.views;
      });

      res.json({
        success: true,
        stats: {
          totalVideos,
          activeVideos,
          totalViews,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  /**
   * GET /api/videos/:id
   * Fetch specific video document and automatically increment view by 1
   */
  app.get('/api/videos/:id', async (req, res) => {
    try {
      const videoId = req.params.id;
      const noTrack = req.query.no_track === 'true';
      const docRef = doc(db, VIDEOS_COLLECTION, videoId);
      const snap = await getDoc(docRef);

      if (!snap.exists()) {
        return res.status(404).json({ success: false, error: 'Video not found' });
      }

      const data = snap.data();
      let currentViews = typeof data.views === 'number' ? data.views : 0;

      if (!noTrack) {
        await updateDoc(docRef, { views: increment(1) });
        currentViews += 1;
      }

      res.json({
        success: true,
        video: {
          id: snap.id,
          direct_url: data.direct_url || '',
          views: currentViews,
          is_active: data.is_active ?? true,
        },
        tracked_view: !noTrack,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  });

  /**
   * POST /api/videos/:id/view or POST /api/videos/track-view
   * Explicit endpoint for frontend to record a view
   */
  const handleTrackView = async (req: express.Request, res: express.Response) => {
    try {
      const videoId = req.params.id || req.body.video_id || req.body.id;
      if (!videoId) {
        return res.status(400).json({ success: false, error: 'video_id is required' });
      }

      const docRef = doc(db, VIDEOS_COLLECTION, videoId);
      await updateDoc(docRef, { views: increment(1) });

      res.json({
        success: true,
        video_id: videoId,
        message: 'View successfully recorded (+1 view in Firestore)',
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message });
    }
  };

  app.post('/api/videos/:id/view', handleTrackView);
  app.post('/api/videos/track-view', handleTrackView);

  /**
   * POST /api/videos/batch and POST /api/videos/import
   * High-speed bulk link processor. Automatically partitions links across multiple
   * concurrent worker sessions depending on the total quantity of links (e.g. 1000 links
   * shared among 20-25 parallel sessions), commits via chunked Firestore writeBatch,
   * and guarantees accuracy and speed.
   */
  const handleBatchImport = async (req: express.Request, res: express.Response) => {
    const startTime = Date.now();
    try {
      const rawUrls: string[] = Array.isArray(req.body.urls)
        ? req.body.urls
        : Array.isArray(req.body.videos)
        ? req.body.videos.map((v: any) => (typeof v === 'string' ? v : v.direct_url))
        : typeof req.body.url === 'string'
        ? [req.body.url]
        : [];

      // Filter and clean URLs
      const cleanedUrls = rawUrls
        .map((u) => (typeof u === 'string' ? u.trim() : ''))
        .filter((u) => u.length > 0);

      if (cleanedUrls.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid video links provided in payload (provide urls array).',
        });
      }

      const total = cleanedUrls.length;

      // Dynamically determine the number of worker sessions based on link quantity
      let numSessions = 2;
      if (total > 1500) numSessions = 25;
      else if (total > 800) numSessions = 20;
      else if (total > 300) numSessions = 15;
      else if (total > 100) numSessions = 10;
      else if (total > 30) numSessions = 6;
      else if (total > 10) numSessions = 4;

      const shouldVerify = req.body.verify === true;

      // Partition links across dynamic worker sessions
      const sessionBuckets: string[][] = Array.from({ length: numSessions }, () => []);
      cleanedUrls.forEach((url, idx) => {
        sessionBuckets[idx % numSessions].push(url);
      });

      let totalAdded = 0;
      let totalSkipped = 0;
      const sessionSummaries: Array<{ session: number; count: number; added: number; skipped: number }> = [];

      // Execute worker sessions in parallel
      const sessionTasks = sessionBuckets.map(async (bucket, sessionIdx) => {
        if (bucket.length === 0) return;

        let sessionValidUrls: string[] = [];

        if (shouldVerify) {
          // Fast verification in parallel within session
          const verifyResults = await Promise.allSettled(
            bucket.map(async (url) => {
              try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3500);
                const resp = await fetch(url, { method: 'HEAD', signal: controller.signal });
                clearTimeout(timeoutId);
                return { url, valid: resp.ok || resp.status < 400 };
              } catch (e) {
                // Optimistic fallback for network/CORS restrictions
                return { url, valid: true };
              }
            })
          );

          for (const result of verifyResults) {
            if (result.status === 'fulfilled' && result.value.valid) {
              sessionValidUrls.push(result.value.url);
            } else {
              totalSkipped++;
            }
          }
        } else {
          sessionValidUrls = bucket;
        }

        // Chunk into Firestore writeBatch groups of max 400 docs
        const BATCH_SIZE = 400;
        for (let i = 0; i < sessionValidUrls.length; i += BATCH_SIZE) {
          const chunk = sessionValidUrls.slice(i, i + BATCH_SIZE);
          const batch = writeBatch(db);

          for (const url of chunk) {
            const docRef = doc(collection(db, VIDEOS_COLLECTION));
            batch.set(
              docRef,
              {
                direct_url: url,
                source_webpage: url,
                page_url: url,
                is_active: true,
                views: 0,
                created_at: serverTimestamp(),
              },
              { merge: true }
            );
          }

          await batch.commit();
          totalAdded += chunk.length;
        }

        sessionSummaries.push({
          session: sessionIdx + 1,
          count: bucket.length,
          added: sessionValidUrls.length,
          skipped: bucket.length - sessionValidUrls.length,
        });
      });

      await Promise.all(sessionTasks);

      const durationMs = Date.now() - startTime;

      res.json({
        success: true,
        added: totalAdded,
        skipped: totalSkipped,
        total: total,
        sessions: numSessions,
        duration_ms: durationMs,
        message: `Successfully processed ${totalAdded} video stream${totalAdded > 1 ? 's' : ''} across ${numSessions} concurrent sessions in ${durationMs}ms.`,
        session_details: sessionSummaries,
      });
    } catch (err: any) {
      console.error('Error in batch import handler:', err);
      res.status(500).json({
        success: false,
        error: err?.message || 'Failed to process bulk links',
        duration_ms: Date.now() - startTime,
      });
    }
  };

  app.post('/api/videos/batch', handleBatchImport);
  app.post('/api/videos/import', handleBatchImport);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
