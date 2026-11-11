import type { SocialStatusDisplay } from '@/lib/interfaces';
import type { SocialGroupRole, SocialGroupVisibility } from '@/lib/schema';

export const GROUP_CHAT_EXPIRY_DAYS = 30;
export const GROUP_CHAT_PAGE_SIZE = 40;
export const GROUP_CHAT_MAX_CONTENT = 5_000;
export const GROUP_CHAT_MAX_ATTACHMENTS = 4;
export const GROUP_CHAT_UNAVAILABLE = 'This group chat is not available.';
export type LegacyChatMediaTarget =
  { kind: 'dm'; actorId: string } | { kind: 'group'; groupId: string };
export const ENCRYPTED_CHAT_UPDATE_EVENT = 'pana-encrypted-chat-updated';
export interface EncryptedChatEvent {
  type: 'encrypted';
  roomId: string;
  kind: 'message' | 'membership' | 'delete';
  at: number;
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
  encrypted?: boolean;
  encryptedAttachments?: Array<{ id: string; name: string; mediaType: string }>;
  attachmentErrors?: Record<string, string>;
  loadingAttachments?: string[];
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
  encryptionRequired?: boolean;
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
  encryptedRoomId?: string;
  encryptedUpdatedAt?: string;
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
