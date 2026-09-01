/**
 * zodToOpenApi (#1412): Zod → OpenAPI 3.0 conversion + the degrade path.
 * The end-to-end enricher behaviour is covered by tests/integration/api-docs.
 */
import { attachZodBodySchemas, zodToOpenApi } from '../../../src/nest/common/api-zod';
import { ZodValidationPipe } from '../../../src/nest/common/zod-validation.pipe';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

describe('zodToOpenApi', () => {
  it('converts an object schema with required/optional split', () => {
    const out = zodToOpenApi(z.object({ name: z.string(), count: z.number().optional() })) as {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(out.type).toBe('object');
    expect(out.properties.name).toEqual({ type: 'string' });
    expect(out.properties.count).toEqual({ type: 'number' });
    expect(out.required).toEqual(['name']);
  });

  it('survives transform-heavy schemas via unrepresentable: any', () => {
    const out = zodToOpenApi(z.object({ when: z.string().transform((s) => new Date(s)) }));
    expect((out as { type: string }).type).toBe('object');
  });

  it('degrades to a bare object instead of throwing on a broken schema', () => {
    expect(zodToOpenApi({} as never)).toEqual({ type: 'object' });
  });

  it('uses the schema passed to a full-body Zod pipe in the OpenAPI request body', () => {
    const schema = z.object({ name: z.string() });
    class DemoController {
      create(): void {}
    }
    const handler = DemoController.prototype.create;
    Reflect.defineMetadata(PATH_METADATA, 'api/demo', DemoController);
    Reflect.defineMetadata(METHOD_METADATA, RequestMethod.POST, handler);
    Reflect.defineMetadata(PATH_METADATA, 'create', handler);
    Reflect.defineMetadata(
      ROUTE_ARGS_METADATA,
      { '3:0': { index: 0, data: undefined, pipes: [new ZodValidationPipe(schema)] } },
      DemoController,
      'create',
    );

    const document = { paths: { '/api/demo/create': { post: {} } } } as never;
    attachZodBodySchemas(
      { get: () => new Map([['demo', { controllers: new Map([['DemoController', { metatype: DemoController }]]) }]]) } as never,
      document,
    );

    expect(document.paths['/api/demo/create'].post.requestBody.content['application/json'].schema).toMatchObject({
      type: 'object',
      properties: { name: { type: 'string' } },
    });
  });
});
