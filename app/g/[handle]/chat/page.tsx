import { GroupChatPage } from '@/app/messages/_components/group-chat-page';

export const metadata = {
  title: 'Group chat | Pana Social',
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  return <GroupChatPage handle={handle} />;
}
