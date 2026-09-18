import { getCore } from '../../../server/core';

export function GET(request: Request): Response {
  const q = new URL(request.url).searchParams.get('q')?.trim();

  return Response.json(getCore().listCustomers(q === '' ? undefined : q));
}
