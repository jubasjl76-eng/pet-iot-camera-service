/**
 * OpenAPI registry for the camera service (hardening Phase 14, A1).
 * Routes migrate onto `apiRoute()` file-by-file; the rest are served but not
 * yet in the spec.
 */
import { createOpenApiRegistry } from '@jubasjl76-eng/shared/openapi';

export const { apiRoute, buildOpenApiDoc, docsHtml } = createOpenApiRegistry({
  title: 'Pet IoT Camera Service API',
  description:
    'Edge service — LAN-local RTSP, HLS, motion, and two-way-audio signalling. Runs at the kennel, not in the cloud.',
  servers: [{ url: '/api' }],
  bearerAuth: false, // edge service on the LAN; no JWT
});
