import dynamic from 'next/dynamic';

const DeleteAccountForm = dynamic(() => import('./DeleteAccountForm'), {
  loading: () => (
    <main className="surface-cream flex min-h-screen items-center justify-center">
      <p role="status" className="font-bold">
        Loading...
      </p>
    </main>
  ),
});

export default function DeleteAccountPage() {
  return <DeleteAccountForm />;
}
