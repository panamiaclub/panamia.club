import { MessagesPageContent } from './_components/messages-page';

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{
    group?: string | string[];
    to?: string | string[];
  }>;
}) {
  const params = await searchParams;
  return (
    <MessagesPageContent
      initialGroupHandle={
        typeof params.group === 'string' ? params.group : undefined
      }
      initialActorId={typeof params.to === 'string' ? params.to : undefined}
    />
  );
}
