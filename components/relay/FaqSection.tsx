import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export function FaqSection() {
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-xl font-semibold">Frequently Asked Questions</h2>
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="primal-leak">
          <AccordionTrigger className="text-left">
            If I use Primal with this key, are my posts private to Pana?
          </AccordionTrigger>
          <AccordionContent className="text-muted-foreground space-y-3 text-sm">
            <p>
              No. Primal isn&rsquo;t a normal Nostr relay — it&rsquo;s a
              third-party service with its own indexing backend. When you
              publish a post through the Primal app, it goes <em>two</em> places
              at once: to every relay in your Primal &ldquo;Relays&rdquo; list{' '}
              <em>and</em> to Primal&rsquo;s own cache server.
            </p>
            <p>
              The cache server stores and indexes your post regardless of what
              relays you have configured. From that moment, any Primal user who
              searches for your pubkey or views your profile can see it. So even
              if you remove every public relay from Primal&rsquo;s settings and
              keep only <code>relay.panamia.club</code>, posting through Primal
              still makes your note publicly visible via Primal&rsquo;s app.
            </p>
            <p>
              <strong>
                If you want something to stay inside the Pana community,
                don&rsquo;t post it through Primal.
              </strong>{' '}
              Group chat in Nostrord is safer — Primal doesn&rsquo;t index
              group-chat events and most Primal builds won&rsquo;t route them
              through their cache at all.
            </p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="encryption">
          <AccordionTrigger className="text-left">
            What&rsquo;s encrypted? What&rsquo;s not?
          </AccordionTrigger>
          <AccordionContent className="text-muted-foreground space-y-3 text-sm">
            <p>
              <strong>Community group chat is not end-to-end encrypted.</strong>{' '}
              Treat the community group like a members-only public bulletin
              board, not a private channel. The data is encrypted on the server
              but accessible to the relay itself.
            </p>
            <p>
              <strong>
                Private encrypted groups are end-to-end encrypted but entirely
                self-service.
              </strong>{' '}
              Our relay also accommodates end-to-end encrypted group chats.
              Because those messages are encrypted, we cannot see who is in your
              group or what is said unless it is reported to us as an abuse
              complaint. Pana MIA does not create or manage these groups; you
              and people you trust set them up in a client that supports the
              feature (see <em>Suggested apps</em> above).
            </p>
            <p>
              <strong>Direct messages are end-to-end encrypted.</strong> Modern
              Nostr DMs (NIP-17 &ldquo;gift wrap&rdquo;) hide both the message
              content and the sender&rsquo;s identity from the relay; only the
              recipient can decrypt. Use DMs — not the community group — for
              anything sensitive between two people.
            </p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}
