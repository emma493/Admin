/**
 * ShortXX Admin & Client Notification Dispatcher
 * notification.js - Visual alert & toast notifier for high-priority telemetry triggers
 */
(function (window, document) {
  'use strict';

  function showToast(message, type) {
    type = type || 'info';
    var toast = document.createElement('div');
    toast.className = 'shortxx-toast shortxx-toast-' + type;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.zIndex = '9999';
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '12px';
    toast.style.background = '#09090b';
    toast.style.color = '#ffffff';
    toast.style.border = '1px solid #dc2626';
    toast.style.boxShadow = '0 10px 25px -5px rgba(220, 38, 38, 0.4)';
    toast.style.fontFamily = 'sans-serif';
    toast.style.fontSize = '13px';
    toast.style.fontWeight = 'bold';
    toast.style.transition = 'all 0.3s ease';

    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 4000);
  }

  window.ShortxxNotification = {
    showToast: showToast,
    alertGetAppClick: function (userId, country) {
      showToast('🚀 High Priority: User ' + (userId || 'Visitor') + ' (' + (country || 'GH') + ') clicked Get App!', 'success');
    }
  };

  // Listen for shortxx_telemetry events
  window.addEventListener('shortxx_telemetry', function (e) {
    if (e.detail && (e.detail.event_type === 'get_app_click' || e.detail.event_type === 'app_download_intent')) {
      window.ShortxxNotification.alertGetAppClick(e.detail.userId, e.detail.country);
    }
  });
})(window, document);
