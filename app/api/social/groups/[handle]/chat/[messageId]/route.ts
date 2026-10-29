import {
  groupChatActor,
  groupChatResponse,
} from '@/lib/server/group-chat-request';
import { deleteGroupChatMessage } from '@/lib/server/group-chat';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ handle: string; messageId: string }> }
) {
  const viewer = await groupChatActor();
  if ('response' in viewer) return viewer.response;
  const { handle, messageId } = await params;
  const result = await deleteGroupChatMessage(
    handle,
    viewer.actorId,
    messageId
  );
  return groupChatResponse(
    result.success ? result : { success: false, error: result.error },
    result.success ? 200 : result.status
  );
}
