import { NextRequest } from 'next/server';
import {
  groupChatActor,
  groupChatResponse,
} from '@/lib/server/group-chat-request';
import { readGroupChat, sendGroupChatMessage } from '@/lib/server/group-chat';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const viewer = await groupChatActor();
  if ('response' in viewer) return viewer.response;
  const { handle } = await params;
  const cursor = request.nextUrl.searchParams.get('cursor') ?? undefined;
  const requestedLimit = request.nextUrl.searchParams.get('limit');
  const result = await readGroupChat(handle, viewer.actorId, {
    cursor,
    limit: requestedLimit === null ? undefined : Number(requestedLimit),
  });
  return groupChatResponse(
    result.success ? result : { success: false, error: result.error },
    result.success ? 200 : result.status
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const viewer = await groupChatActor();
  if ('response' in viewer) return viewer.response;
  const { handle } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return groupChatResponse({ success: false, error: 'Invalid JSON' }, 400);
  }
  const result = await sendGroupChatMessage(handle, viewer.actorId, body);
  return groupChatResponse(
    result.success ? result : { success: false, error: result.error },
    result.success ? 201 : result.status
  );
}
