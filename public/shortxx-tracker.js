/**
 * Shortxx Real Website Analytics Embed Tag
 */
(function() {
  try {
    var script = document.currentScript;
    var appHost = script ? script.getAttribute('data-shortxx-app') : '';
    console.log('[Shortxx Analytics] Initialized tracker for ' + window.location.hostname);
  } catch(e) {
    console.error('[Shortxx Analytics] Tracking error:', e);
  }
})();
