/**
 * ShortXX Video Ads Client SDK & Loader
 * shortxx-ads.js - Automatically queries and plays active video ads from Firestore
 */
(function (window, document) {
  'use strict';

  var FIREBASE_CONFIG = {
    projectId: 'intense-augury-28gvj'
  };
  var DATABASE_ID = 'ai-studio-shortxxadmindash-86192a98-919e-436c-80b9-836d96e0e32b';
  var ADS_COLLECTION = 'ads';

  var ShortxxAds = {
    config: FIREBASE_CONFIG,
    databaseId: DATABASE_ID,
    collectionName: ADS_COLLECTION,
    cachedAds: [],

    /**
     * Initializes ad player on a given video element
     */
    attach: function (videoElement, options) {
      if (!videoElement) return;
      options = options || {};

      videoElement.setAttribute('playsinline', '');
      videoElement.setAttribute('webkit-playsinline', '');
      videoElement.muted = options.muted !== undefined ? options.muted : true;
      videoElement.autoplay = options.autoplay !== undefined ? options.autoplay : true;

      var self = this;
      function next() {
        self.fetchRandomAd().then(function (ad) {
          if (!ad) return;
          videoElement.src = ad.hls_url || ad.direct_url;
          videoElement.play().catch(function () {});
          if (options.onAdLoaded) options.onAdLoaded(ad);
        });
      }

      videoElement.addEventListener('ended', function () {
        if (options.onAdEnded) options.onAdEnded();
        next();
      });

      next();
    },

    /**
     * Fetch active ads using Firestore REST API fallback (zero npm dependency)
     */
    fetchRandomAd: function () {
      var url = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_CONFIG.projectId +
        '/databases/' + DATABASE_ID + '/documents:runQuery';

      var queryPayload = {
        structuredQuery: {
          from: [{ collectionId: ADS_COLLECTION }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'is_active' },
              op: 'EQUAL',
              value: { booleanValue: true }
            }
          }
        }
      };

      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(queryPayload)
      })
        .then(function (res) { return res.json(); })
        .then(function (results) {
          if (!Array.isArray(results) || results.length === 0) return null;
          var valid = results.filter(function (r) { return r.document && r.document.fields; });
          if (valid.length === 0) return null;

          var item = valid[Math.floor(Math.random() * valid.length)].document;
          var pathParts = item.name.split('/');
          var docId = pathParts[pathParts.length - 1];
          var fields = item.fields || {};

          var ad = {
            id: docId,
            direct_url: fields.direct_url ? fields.direct_url.stringValue : '',
            hls_url: fields.hls_url ? fields.hls_url.stringValue : '',
            is_active: fields.is_active ? fields.is_active.booleanValue : true,
            views: fields.views ? (fields.views.integerValue || fields.views.doubleValue || 0) : 0
          };

          // Increment view
          if (window.ShortxxTracker && typeof window.ShortxxTracker.logEvent === 'function') {
            window.ShortxxTracker.logEvent('ad_view', 'Viewed ad stream: ' + ad.id, ad.id);
          }

          return ad;
        })
        .catch(function (err) {
          console.error('[ShortxxAds] Failed to fetch ad:', err);
          return null;
        });
    }
  };

  window.ShortxxAds = ShortxxAds;
})(window, document);
