import {
  groupChatActor,
  groupChatResponse,
} from '@/lib/server/group-chat-request';
import { listGroupChats } from '@/lib/server/group-chat';

export async function GET() {
  const viewer = await groupChatActor();
  if ('response' in viewer) return viewer.response;
  return groupChatResponse({
    success: true,
    data: await listGroupChats(viewer.actorId),
  });
}
