import { onCLS, onFCP, onLCP, onTTFB, onINP, Metric } from 'web-vitals';
import ReactGA from 'react-ga4';

// Retrieve Measurement ID from Vite environment or default fallback
const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || 'G-D71EG5Z8H2';

if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== 'G-XXXXXXXXXX') {
  ReactGA.initialize(GA_MEASUREMENT_ID);
}

const sendToAnalytics = (metric: Metric) => {
  const { name, delta, id, value } = metric;
  
  // Log locally to the console for verification
  console.log(`[Web Vital] ${name}:`, value);

  // Send metric hit events to Google Analytics 4
  ReactGA.event({
    category: 'Web Vitals',
    action: name,
    value: Math.round(name === 'CLS' ? delta * 1000 : delta), // GA values must be integers
    label: id, // unique event instance ID
    nonInteraction: true, // marks event as non-affecting to page bounce rate
  });
};

export function reportWebVitals() {
  onCLS(sendToAnalytics);
  onLCP(sendToAnalytics);
  onFCP(sendToAnalytics);
  onTTFB(sendToAnalytics);
  onINP(sendToAnalytics);
}
