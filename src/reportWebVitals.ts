import { onCLS, onINP, onLCP } from 'web-vitals';
import ReactGA from 'react-ga4';

// Retrieve IDs from Vite environment or default placeholders
const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || 'G-D71EG5Z8H2';
const CLARITY_PROJECT_ID = import.meta.env.VITE_CLARITY_PROJECT_ID || 'py583i1q7m';

// Initialize GA4
if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== 'G-XXXXXXXXXX') {
  ReactGA.initialize(GA_MEASUREMENT_ID);
}

// Initialize Microsoft Clarity dynamically
if (CLARITY_PROJECT_ID && CLARITY_PROJECT_ID !== 'clarity-id-placeholder') {
  (function(c: any, l: any, a: any, r: any, i: any, t?: any, y?: any) {
    c[a] = c[a] || function() { (c[a].q = c[a].q || []).push(arguments) };
    t = l.createElement(r); t.async = 1; t.src = "https://www.clarity.ms/tag/" + i;
    y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
  })(window, document, "clarity", "script", CLARITY_PROJECT_ID);
}

// Function to send metrics to GA4
function sendToGA({ name, value, id }: any) {
  // Log locally to console for verification
  console.log(`[Web Vital Event] ${name}:`, value);

  if (typeof (window as any).gtag === 'function') {
    (window as any).gtag('event', name, {
      value: Math.round(name === 'CLS' ? value * 1000 : value), // GA values must be integers
      metric_id: id,
      metric_value: value,
    });
  }
}

export function reportWebVitals() {
  onLCP(sendToGA);
  onCLS(sendToGA);
  onINP(sendToGA);
}
