import React from 'react';

/**
 * Wraps dynamic React.lazy imports with automated retry and cache invalidation.
 * Handles the common SPA issue where a new deployment replaces hashed asset files,
 * causing users with older tabs open to fail loading chunks when navigating.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    const pageHasAlreadyBeenForceRefreshed = JSON.parse(
      window.sessionStorage.getItem('chunk_failed_refreshed') || 'false'
    );

    try {
      const component = await componentImport();
      window.sessionStorage.setItem('chunk_failed_refreshed', 'false');
      return component;
    } catch (error: any) {
      const errorMessage = error?.message || String(error || '');
      const isChunkError =
        errorMessage.includes('Failed to fetch dynamically imported module') ||
        errorMessage.includes('Expected a JavaScript-or-Wasm module script') ||
        errorMessage.includes('Importing a module script failed') ||
        errorMessage.includes('MIME type of "text/html"') ||
        error?.name === 'ChunkLoadError' ||
        error?.code === 'MODULE_NOT_FOUND';

      if (isChunkError && !pageHasAlreadyBeenForceRefreshed) {
        // Mark that we are refreshing once to load the latest deployment bundle
        window.sessionStorage.setItem('chunk_failed_refreshed', 'true');
        window.location.reload();
        // Return a pending promise so React does not render an error boundary while reloading
        return new Promise<{ default: T }>(() => {});
      }

      // If already refreshed or temporary network blip, wait 1 second and retry once
      try {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const retryComponent = await componentImport();
        window.sessionStorage.setItem('chunk_failed_refreshed', 'false');
        return retryComponent;
      } catch {
        throw error;
      }
    }
  });
}
