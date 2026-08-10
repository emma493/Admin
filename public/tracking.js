/**
 * ShortXX Platform Client Telemetry Tracker
 * tracking.js - Automatically records user engagement, video telemetry, and app download events
 */
(function (window, document) {
  'use strict';

  var STORAGE_KEY = 'shortxx_visitor_id';

  function getVisitorId() {
    var id = localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = 'U_' + Math.random().toString(36).substring(2, 10).toUpperCase();
      localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  }

  function detectDeviceType() {
    var ua = navigator.userAgent || '';
    if (/tablet|ipad|playbook|silk/i.test(ua)) return 'Tablet';
    if (/mobile|iphone|ipod|android|blackberry|mini|windows\s+ce|palm/i.test(ua)) return 'Mobile';
    return 'Desktop';
  }

  function detectCountry() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (tz.indexOf('Accra') !== -1 || tz.indexOf('Ghana') !== -1) return 'GH';
      if (tz.indexOf('Lagos') !== -1 || tz.indexOf('Nigeria') !== -1) return 'NG';
      if (tz.indexOf('America') !== -1 || tz.indexOf('New_York') !== -1) return 'US';
      if (tz.indexOf('London') !== -1) return 'GB';
    } catch (e) {}
    return 'GH';
  }

  var Tracker = {
    visitorId: getVisitorId(),
    deviceType: detectDeviceType(),
    country: detectCountry(),

    logEvent: function (eventType, details, videoId) {
      var payload = {
        event_type: eventType,
        userId: this.visitorId,
        timestamp: new Date().toISOString(),
        user_agent: navigator.userAgent,
        device_type: this.deviceType,
        video_id: videoId || '',
        referrer: document.referrer || 'Direct',
        country: this.country,
        details: details || ('Telemetry action: ' + eventType)
      };

      // Dispatch custom DOM event for local page listeners
      if (typeof window.CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('shortxx_telemetry', { detail: payload }));
      }

      // If Firebase SDK or window.ShortxxTracker API is loaded, invoke it
      if (window.ShortxxTrackerAPI && typeof window.ShortxxTrackerAPI.logEvent === 'function') {
        window.ShortxxTrackerAPI.logEvent(payload);
      }

      console.log('[Shortxx Telemetry Logged]', payload);
      return payload;
    },

    trackGetAppClick: function (videoId) {
      return this.logEvent('get_app_click', 'User clicked Get App / Android APK download', videoId);
    },

    trackUnmuteShake: function (videoId) {
      return this.logEvent('unmute_shake', 'User unmuted video stream (shake/tap)', videoId);
    },

    trackDoubleTapHeart: function (videoId) {
      return this.logEvent('double_tap_heart', 'User double-tapped video stream to heart/like', videoId);
    },

    trackProgressDrag: function (videoId, timeSec) {
      return this.logEvent('progress_drag', 'User dragged seek bar to ' + (timeSec || 0) + 's', videoId);
    },

    trackPause: function (videoId) {
      return this.logEvent('pause', 'User paused video playback', videoId);
    },

    trackVideoView: function (videoId) {
      return this.logEvent('video_view', 'User played / viewed video stream', videoId);
    }
  };

  window.ShortxxTracker = Tracker;

  // Auto-attach to all elements with data-shortxx-action
  document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('click', function (e) {
      var target = e.target.closest('[data-shortxx-action]');
      if (target) {
        var action = target.getAttribute('data-shortxx-action');
        var videoId = target.getAttribute('data-video-id') || '';
        if (action === 'get_app') Tracker.trackGetAppClick(videoId);
        else if (action === 'unmute') Tracker.trackUnmuteShake(videoId);
        else if (action === 'heart') Tracker.trackDoubleTapHeart(videoId);
      }
    });
  });
})(window, document);
