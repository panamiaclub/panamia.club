import { MessagesPageContent } from './_components/messages-page';

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string | string[] }>;
}) {
  const params = await searchParams;
  return (
    <MessagesPageContent
      initialGroupHandle={
        typeof params.group === 'string' ? params.group : undefined
      }
    />
  );
}
