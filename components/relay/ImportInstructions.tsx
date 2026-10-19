// Server component — links and step-by-step copy. The Nostrord deeplink
// preconfigures the panamia relay and group so the user only needs to paste
// their nsec.
import { Card, CardContent } from '@/components/ui/card';
import { ExternalLink } from 'lucide-react';

const NOSTRORD_DEEPLINK =
  'https://web.nostrord.com/?relay=relay.panamia.club&group=panamia-test';

export function ImportInstructions() {
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-xl font-semibold">Connect with Nostrord</h2>

      <Card>
        <CardContent className="space-y-6 pt-6 text-sm">
          <div>
            <h3 className="mb-2 font-medium">Open the Nostrord web client</h3>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Go to{' '}
                <a
                  className="text-primary inline-flex items-center gap-1 underline"
                  href={NOSTRORD_DEEPLINK}
                  target="_blank"
                  rel="noreferrer"
                >
                  web.nostrord.com (panamia-test)
                  <ExternalLink className="h-3 w-3" />
                </a>
                . The link preconfigures the relay and group for you.
              </li>
              <li>
                Choose <strong>Private Key</strong> → <strong>Login</strong>.
              </li>
              <li>
                Paste the <code>nsec…</code> you saved above.
              </li>
            </ol>
            <p className="text-muted-foreground mt-3">
              The web client lives entirely in your browser tab. Closing it
              doesn&rsquo;t lose the key (it&rsquo;s in local storage), but
              clearing browser data will. The <code>nsec</code> you saved is
              your one source of truth — keep it.
            </p>
          </div>

          <div>
            <h3 className="mb-2 font-medium">Native apps</h3>
            <p>
              The web client is the easiest way to start. If you&rsquo;d rather
              run a native app:
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              <li>
                <strong>macOS:</strong> grab the latest installer from{' '}
                <a
                  className="text-primary inline-flex items-center gap-1 underline"
                  href="https://nostrord.com/download"
                  target="_blank"
                  rel="noreferrer"
                >
                  nostrord.com/download
                  <ExternalLink className="h-3 w-3" />
                </a>
                . On first launch, choose <strong>Private Key</strong> →{' '}
                <strong>Login</strong> and paste your <code>nsec…</code>.
              </li>
              <li>
                <strong>Android (pre-marketplace):</strong> the Android build
                isn&rsquo;t in Google Play yet. Sideload the latest APK from{' '}
                <a
                  className="text-primary inline-flex items-center gap-1 underline"
                  href="https://nostrord.com/download"
                  target="_blank"
                  rel="noreferrer"
                >
                  nostrord.com/download
                  <ExternalLink className="h-3 w-3" />
                </a>
                . You&rsquo;ll need to allow installation from unknown sources
                in Settings → Security → Install unknown apps.
              </li>
            </ul>
            <p className="text-muted-foreground mt-3">
              Whichever client you pick, the same <code>nsec</code> works. You
              can run multiple at once and they&rsquo;ll see the same messages
              from the relay.
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
