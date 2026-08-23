import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App.jsx';
import ErrorBoundary from '@/components/ErrorBoundary.jsx';
import '@/index.css';

// Browser auto-translate (Google Translate, Edge Translate, Safari Translate, etc.)
// mutates the live DOM by wrapping text nodes in extra <font>/<span> elements. When
// React later tries to remove or reorder those nodes during its own reconciliation,
// the node it expects to find is no longer where it left it, and the browser throws
// a DOMException ("NotFoundError: Failed to execute 'removeChild'/'insertBefore' on
// 'Node'"). React 18 treats that render-phase throw as fatal and unmounts the whole
// tree, which is what causes the page to go blank. Patch the two DOM methods to fail
// safe (no-op) instead of throwing when the node has already been detached/moved.
(function patchDomForTranslateSafety() {
  if (typeof Node === 'undefined' || !Node.prototype) return;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child && child.parentNode !== this) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[DOM Safety] Skipped removeChild on a node not owned by this parent (likely browser translation).');
      }
      return child;
    }
    return originalRemoveChild.call(this, child);
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[DOM Safety] Skipped insertBefore with a reference node not owned by this parent (likely browser translation).');
      }
      return this.appendChild(newNode);
    }
    return originalInsertBefore.call(this, newNode, referenceNode);
  };
})();

// Global Fetch Interceptor to prevent 431 Request Header Too Large errors.
// This ensures that third-party analytics/event APIs do not receive bloated cookies 
// or internal application Authorization headers.
const originalFetch = window.fetch;

window.fetch = async function(...args) {
  let [resource, config] = args;
  
  // Check if the request is going to a third-party tracking/event API
  if (typeof resource === 'string' && resource.includes('frontend-event-api.hostinger.com')) {
    config = config || {};
    
    // 1. Strip Authorization and custom tokens
    if (config.headers) {
      const headers = new Headers(config.headers);
      headers.delete('Authorization');
      headers.delete('X-Pocketbase-Token');
      
      const cleanHeaders = {};
      headers.forEach((value, key) => {
        cleanHeaders[key] = value;
      });
      config.headers = cleanHeaders;
    }
    
    // 2. Prevent sending first-party application cookies to analytics domains
    // This is the primary fix for "Request Header Or Cookie Too Large"
    config.credentials = 'omit';
    
    args = [resource, config];
  }
  
  return originalFetch.apply(this, args);
};

// Aggressive Cookie Cleanup Utility
// Cleans up tracking cookies if they begin bloating the domain's cookie storage limit
try {
  if (document.cookie.length > 4000) {
    console.warn('[System] Cookie payload is unusually large, performing cleanup.');
    const cookies = document.cookie.split(';');
    cookies.forEach(c => {
      const cookieName = c.split('=')[0].trim();
      // Only clear known tracker bloat, preserve pb_auth (PocketBase auth state)
      if (cookieName.startsWith('_ga') || cookieName.startsWith('_h') || cookieName.startsWith('hj')) {
        document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
      }
    });
  }
} catch (error) {
  console.warn('[System] Optional cookie cleanup skipped:', error);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);