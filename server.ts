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

// Initialize server-side Firestore instance
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(
  firebaseApp,
  firebaseConfig.firestoreDatabaseId || '(default)'
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
