import { describe, it, expect } from 'vitest';
import { buildOpenApiDoc } from '../openapi.js';
import '../api/index.js'; // registers the migrated routes

describe('camera openapi', () => {
  const doc = buildOpenApiDoc() as any;
  it('is an edge-service spec (no bearer, /api server only)', () => {
    expect(doc.info.title).toMatch(/Camera/);
    expect(doc.servers).toEqual([{ url: '/api' }]);
    expect(doc.components.securitySchemes).toBeUndefined();
  });
  it('documents the migrated camera routes', () => {
    for (const p of ['/api/cameras', '/api/cameras/{id}', '/api/ice-servers']) {
      expect(doc.paths[p]).toBeDefined();
    }
    expect(doc.paths['/api/cameras'].post.requestBody.content['application/json'].schema.required)
      .toEqual(expect.arrayContaining(['name', 'rtspUrl']));
    expect(Object.keys(doc.paths['/api/cameras'].get.responses)).toContain('429');
  });
});
