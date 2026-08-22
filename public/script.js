/**
 * ShortXX Video Player Interaction & Event Mechanics
 * script.js - Handles unmute shakes, double-tap hearts, progress bar drag seek, and Get App triggers
 */
(function (window, document) {
  'use strict';

  function initPlayerMechanics() {
    var videos = document.querySelectorAll('video');
    videos.forEach(function (video) {
      var lastTap = 0;
      var videoId = video.getAttribute('data-video-id') || video.id || 'vid_main';

      // Double-Tap to Heart Gesture
      video.addEventListener('touchend', function (e) {
        var currentTime = new Date().getTime();
        var tapLength = currentTime - lastTap;
        if (tapLength < 300 && tapLength > 0) {
          if (window.ShortxxTracker) {
            window.ShortxxTracker.trackDoubleTapHeart(videoId);
          }
          e.preventDefault();
        }
        lastTap = currentTime;
      });

      // Unmute trigger
      video.addEventListener('volumechange', function () {
        if (!video.muted && window.ShortxxTracker) {
          window.ShortxxTracker.trackUnmuteShake(videoId);
        }
      });

      // Play / Video View trigger
      video.addEventListener('play', function () {
        if (window.ShortxxTracker) {
          window.ShortxxTracker.trackVideoView(videoId);
        }
      });

      // Pause trigger
      video.addEventListener('pause', function () {
        if (window.ShortxxTracker) {
          window.ShortxxTracker.trackPause(videoId);
        }
      });

      // Seek / Progress bar drag
      video.addEventListener('seeked', function () {
        if (window.ShortxxTracker) {
          window.ShortxxTracker.trackProgressDrag(videoId, Math.round(video.currentTime));
        }
      });
    });

    // Get App CTA buttons
    var getAppBtns = document.querySelectorAll('.get-app-btn, #getAppBtn, [data-action="get_app"]');
    getAppBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var videoId = btn.getAttribute('data-video-id') || '';
        if (window.ShortxxTracker) {
          window.ShortxxTracker.trackGetAppClick(videoId);
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlayerMechanics);
  } else {
    initPlayerMechanics();
  }
})(window, document);
