import {
  groupChatActor,
  groupChatResponse,
} from '@/lib/server/group-chat-request';
import { reactToGroupChatMessage } from '@/lib/server/group-chat';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ handle: string; messageId: string }> }
) {
  const viewer = await groupChatActor();
  if ('response' in viewer) return viewer.response;
  const { handle, messageId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return groupChatResponse({ success: false, error: 'Invalid JSON' }, 400);
  }
  const result = await reactToGroupChatMessage(
    handle,
    viewer.actorId,
    messageId,
    body
  );
  return groupChatResponse(
    result.success ? result : { success: false, error: result.error },
    result.success ? 200 : result.status
  );
}
