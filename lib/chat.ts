import type { SocialStatusDisplay } from '@/lib/interfaces';
import type { SocialGroupRole, SocialGroupVisibility } from '@/lib/schema';

export const GROUP_CHAT_EXPIRY_DAYS = 30;
export const GROUP_CHAT_PAGE_SIZE = 40;
export const GROUP_CHAT_MAX_CONTENT = 5_000;
export const GROUP_CHAT_MAX_ATTACHMENTS = 4;
export const GROUP_CHAT_UNAVAILABLE = 'This group chat is not available.';

export const CHAT_REACTIONS = [
  { emoji: '👍', label: 'Thumbs up' },
  { emoji: '❤️', label: 'Heart' },
  { emoji: '😂', label: 'Laugh' },
  { emoji: '😮', label: 'Surprised' },
  { emoji: '😢', label: 'Sad' },
  { emoji: '🙏', label: 'Thank you' },
] as const;
export type ChatReactionEmoji = (typeof CHAT_REACTIONS)[number]['emoji'];
export interface ChatReaction {
  emoji: ChatReactionEmoji;
  count: number;
  reacted: boolean;
}

export interface ChatAttachment {
  type: string;
  mediaType: string;
  url: string;
  name?: string | null;
  width?: number;
  height?: number;
}

export type ChatMessage = Pick<
  SocialStatusDisplay,
  'id' | 'actor' | 'content' | 'published' | 'expiresAt' | 'attachments'
> & {
  clientId?: string | null;
  canDelete?: boolean;
  canReact?: boolean;
  reactions?: ChatReaction[];
};

export interface PendingChatMessage {
  id: string;
  content: string;
  attachments?: ChatAttachment[];
  published: string;
  delivery: 'sending' | 'sent' | 'failed';
  serverId?: string;
  clientId?: string;
  error?: string;
}

export interface GroupChatRoom {
  id: string;
  actorId: string;
  handle: string;
  name: string;
  iconUrl: string | null;
  memberCount: number;
  visibility: SocialGroupVisibility;
  role: SocialGroupRole;
}

export interface GroupChatMessage extends ChatMessage {
  groupId: string;
  clientId: string | null;
  published: string;
  expiresAt: string;
  canDelete: boolean;
}

export interface GroupChatConversation extends GroupChatRoom {
  lastMessage: GroupChatMessage | null;
}

export interface GroupChatList {
  groups: GroupChatConversation[];
  viewerActorId: string;
  localDomain: string;
}

export interface GroupChatPage {
  group: GroupChatRoom;
  messages: GroupChatMessage[];
  nextCursor: string | null;
  viewerActorId: string;
  localDomain: string;
}

export interface GroupChatInput {
  clientId: string;
  content: string;
  attachments?: ChatAttachment[];
}

export interface GroupChatOutgoing extends PendingChatMessage {
  groupId: string;
  handle: string;
  clientId: string;
}

export interface GroupChatEvent {
  type: 'group';
  groupId: string;
  kind: 'message' | 'membership';
  messageId?: string;
  at: number;
}
