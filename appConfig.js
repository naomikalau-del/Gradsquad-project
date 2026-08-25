// appConfig.js
// Shared configuration for API origin and Socket.IO client loader

window.API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')
  ? 'http://localhost:3000'
  : 'https://gradsquad-project.onrender.com';

// Load socket.io client synchronously during initial page load. This avoids io undefined errors
// in pages that assume it is available immediately after script tags.
(function loadSocketIo() {
  if (window.io) return;

  try {
    document.write(`<script src="${window.API_BASE_URL}/socket.io/socket.io.js"></script>`);
  } catch (e) {
    console.warn('document.write failed for socket.io load, falling back to dynamic load', e);
    const script = document.createElement('script');
    script.src = `${window.API_BASE_URL}/socket.io/socket.io.js`;
    script.onload = function() {
      if (!window.io) {
        console.warn('socket.io script loaded but io is not available yet');
      }
    };
    script.onerror = function() {
      console.warn('Failed to load socket.io from API base, using CDN fallback');
      const fallback = document.createElement('script');
      fallback.src = 'https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.6.1/socket.io.min.js';
      fallback.onload = function() {
        if (!window.io) {
          console.error('socket.io fallback loaded but io is not available');
        }
      };
      fallback.onerror = function() {
        console.error('Failed to load socket.io from CDN');
      };
      document.head.appendChild(fallback);
    };
    document.head.appendChild(script);
  }
})();

function ensureSocketConnected() {
  return new Promise((resolve, reject) => {
    const check = () => {
      if (window.io) {
        return resolve(window.io(window.API_BASE_URL));
      }
      setTimeout(check, 50);
    };
    check();

    setTimeout(() => reject(new Error('socket.io failed to initialize')), 5000);
  });
}

