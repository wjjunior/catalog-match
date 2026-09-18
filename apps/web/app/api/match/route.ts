import { getCore } from '../../../server/core';
import { matchRequestSchema, type ErrorResponse } from '../../../src/shared/api/schema';

function badRequest(error: string): Response {
  return Response.json({ error } satisfies ErrorResponse, { status: 400 });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest('The request body must be JSON.');
  }

  const parsed = matchRequestSchema.safeParse(body);

  if (!parsed.success) {
    return badRequest(
      parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; '),
    );
  }

  return Response.json(getCore().matchQuery(parsed.data));
}
