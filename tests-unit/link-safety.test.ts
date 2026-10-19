/**
 * Regression tests for the deceptive-link affordance.
 *
 * `sanitizeStatusHtml` closes injection. It does not close deception, because
 * `<a href="https://evil.test">your bank</a>` contains nothing unsafe — only a
 * false claim. `annotateLinkDestinations` is the control that answers it, by
 * showing the real host whenever the visible text does not.
 *
 * Most of these exercise the *composed* pipeline — sanitise, then annotate —
 * rather than the annotator alone. That is deliberate. A test that only calls
 * the helper proves the function is correct; a test that calls both proves the
 * wiring is correct, and only the second one survives somebody restructuring
 * the component that does the calling. The original XSS hole in this repo was
 * a call-site override, not a broken helper.
 *
 * No database or network: every unit here is a pure function.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  annotateLinkDestinations,
  classifyDestination,
} from '@/lib/link-safety';
import { sanitizeStatusHtml, EXTERNAL_LINK_REL } from '@/lib/sanitize-html';

/** The real render path: what `<SafeHtml>` does. */
const render = (html: string) =>
  annotateLinkDestinations(sanitizeStatusHtml(html));

/** The badge value a reader would see, or null when there is no badge. */
function badge(html: string): string | null {
  const match = /data-pana-host="([^"]*)"/.exec(render(html));
  return match ? match[1] : null;
}

const isImpostor = (html: string) => /data-pana-impostor/.test(render(html));

describe('annotateLinkDestinations — the lure', () => {
  test('badges a link whose text claims a different thing entirely', () => {
    assert.equal(
      badge('<a href="https://evil.test">your bank</a>'),
      'evil.test'
    );
  });

  test('names the destination in the accessible name, not just in CSS', () => {
    // The badge is generated content, which screen readers announce
    // inconsistently. If this regresses, the control silently stops existing
    // for anyone not looking at the screen.
    const out = render('<a href="https://evil.test">your bank</a>');
    assert.match(out, /aria-label="your bank — link goes to evil\.test"/);
  });

  test('badges every link in a body, not just the first', () => {
    const out = render(
      '<a href="https://a.test">one</a> and <a href="https://b.test">two</a>'
    );
    assert.match(out, /data-pana-host="a\.test"/);
    assert.match(out, /data-pana-host="b\.test"/);
  });
});

describe('annotateLinkDestinations — text that already reveals the host', () => {
  for (const [name, html] of [
    [
      'bare domain as text',
      '<a href="https://miamicoffee.com">miamicoffee.com</a>',
    ],
    [
      'domain inside prose',
      '<a href="https://miamicoffee.com">visit miamicoffee.com today</a>',
    ],
    [
      'full url as text',
      '<a href="https://miamicoffee.com/x">https://miamicoffee.com/x</a>',
    ],
    [
      'www prefix on the href',
      '<a href="https://www.miamicoffee.com">miamicoffee.com</a>',
    ],
    [
      'text names the parent domain',
      '<a href="https://shop.miamicoffee.com">miamicoffee.com</a>',
    ],
  ] as const) {
    test(`stays quiet: ${name}`, () => {
      assert.equal(
        badge(html),
        null,
        'should not badge a self-describing link'
      );
    });
  }
});

describe('annotateLinkDestinations — host matching boundaries', () => {
  // Both of these are why the comparison is token-and-dot based rather than
  // `text.includes(host)` / `host.endsWith(token)`. Each naive version passes
  // every test above and fails exactly one of these.
  test('a domain that merely contains the host does not count as revealing it', () => {
    assert.equal(
      badge('<a href="https://evil.test">not-evil.test</a>'),
      'evil.test'
    );
  });

  test('a host that merely ends with the claimed domain does not count', () => {
    assert.equal(
      badge('<a href="https://panamia.club.evil.test">panamia.club</a>'),
      'panamia.club.evil.test'
    );
  });

  test('a genuine subdomain of the claimed domain does count', () => {
    assert.equal(badge('<a href="https://bank.evil.com">evil.com</a>'), null);
  });
});

describe('annotateLinkDestinations — homographs', () => {
  test('shows punycode so a lookalike host cannot launder itself', () => {
    // Cyrillic а. Echoing the host back verbatim would reproduce the deception
    // inside the badge meant to expose it.
    const out = badge('<a href="https://\u0430pple.com">apple.com</a>');
    assert.equal(out, 'xn--pple-43d.com');
    assert.doesNotMatch(
      out ?? '',
      /\u0430/,
      'badge must not contain the lookalike'
    );
  });

  test('flags the homograph as an impostor, since the text claims a domain', () => {
    assert.ok(isImpostor('<a href="https://\u0430pple.com">apple.com</a>'));
  });
});

describe('annotateLinkDestinations — impostor tier', () => {
  test('text that is itself a different url is flagged loudly', () => {
    assert.ok(
      isImpostor('<a href="https://evil.test">https://panamia.club</a>')
    );
  });

  test('prose that happens to contain a dotted name is not flagged loudly', () => {
    // `index.js` is domain-shaped. Treating it as a destination claim would
    // paint a warning on ordinary posts about code.
    assert.ok(!isImpostor('<a href="https://example.com">see index.js</a>'));
  });

  test('but such a link still shows its destination', () => {
    assert.equal(
      badge('<a href="https://example.com">see index.js</a>'),
      'example.com'
    );
  });
});

describe('annotateLinkDestinations — links that need no badge', () => {
  for (const [name, html] of [
    [
      'our own apex',
      '<a href="https://panamia.club/directory">the directory</a>',
    ],
    ['a pana subdomain', '<a href="https://social.pana.social/s">the feed</a>'],
    ['a relative path', '<a href="/directory">directory</a>'],
    ['an anchor', '<a href="#top">back to top</a>'],
    ['localhost in dev', '<a href="http://localhost:3000/s">local feed</a>'],
  ] as const) {
    test(`stays quiet: ${name}`, () => {
      assert.equal(badge(html), null);
    });
  }
});

describe('annotateLinkDestinations — mailto', () => {
  test('shows an address the text does not mention', () => {
    assert.equal(badge('<a href="mailto:a@b.com">email me</a>'), 'a@b.com');
  });

  test('stays quiet when the address is written out', () => {
    assert.equal(badge('<a href="mailto:a@b.com">a@b.com</a>'), null);
  });
});

describe('annotateLinkDestinations — forgery resistance', () => {
  test('an author-supplied badge is replaced with the truth', () => {
    const out = render(
      '<a href="https://evil.test" data-pana-host="panamia.club">hi</a>'
    );
    assert.match(out, /data-pana-host="evil\.test"/);
    assert.doesNotMatch(out, /data-pana-host="panamia\.club"/);
  });

  test('an author-supplied aria-label cannot mislabel the destination', () => {
    const out = render(
      '<a href="https://evil.test" aria-label="safe link">hi</a>'
    );
    assert.doesNotMatch(out, /aria-label="safe link"/);
    assert.match(out, /link goes to evil\.test/);
  });

  test('an author cannot forge an impostor flag on an honest link', () => {
    const out = render(
      '<a href="https://panamia.club" data-pana-impostor="true">home</a>'
    );
    assert.doesNotMatch(out, /data-pana-impostor/);
  });

  test('class="mention" does not buy an exemption', () => {
    // A hostile instance can send any class the allowlist permits, and
    // `mention` is permitted. Nothing may key off it.
    assert.equal(
      badge('<a class="mention" href="https://evil.test">@friend</a>'),
      'evil.test'
    );
  });

  test('a domain hidden in an invisible span does not count as revealed', () => {
    // Mastodon uses class="invisible" to hide parts of a shortened URL, and
    // Tailwind's utility of the same name genuinely hides it. Text a reader
    // cannot see cannot be what tells them where they are going.
    assert.equal(
      badge(
        '<a href="https://evil.test"><span class="invisible">evil.test</span>your bank</a>'
      ),
      'evil.test'
    );
  });

  test('but a Mastodon shortened url still reads as self-describing', () => {
    // The visible middle span carries the domain, so this is the one case
    // where invisible-stripping must not produce a badge.
    assert.equal(
      badge(
        '<a href="https://example.com/long"><span class="invisible">https://</span>' +
          '<span class="ellipsis">example.com/lo</span><span class="invisible">ng</span></a>'
      ),
      null
    );
  });
});

describe('annotateLinkDestinations — composition with the sanitiser', () => {
  test('does not resurrect anything the sanitiser removed', () => {
    const out = render(
      '<p>hi <img src=x onerror=alert(1)></p><script>alert(2)</script>'
    );
    assert.doesNotMatch(out, /<img/i);
    assert.doesNotMatch(out, /onerror/i);
    assert.doesNotMatch(out, /<script/i);
  });

  test('leaves a javascript: href unusable', () => {
    const out = render('<a href="javascript:alert(1)">x</a>');
    assert.doesNotMatch(out, /javascript:/i);
  });

  test('preserves the forced rel, so the two modules cannot drift apart', () => {
    // link-safety re-serialises every anchor, which means it owns rel/target
    // on the output. If it stopped importing the shared constant, this is what
    // notices.
    const out = render('<a href="https://evil.test">your bank</a>');
    assert.match(out, new RegExp(`rel="${EXTERNAL_LINK_REL}"`));
    assert.match(out, /target="_blank"/);
  });

  test('is idempotent, so a double render cannot double-badge', () => {
    const once = render('<a href="https://evil.test">your bank</a>');
    assert.equal(annotateLinkDestinations(once), once);
  });

  test('handles an empty body', () => {
    assert.equal(annotateLinkDestinations(''), '');
    assert.equal(render(''), '');
  });

  test('leaves ordinary formatting alone', () => {
    const out = render('<p><strong>hi</strong> <em>there</em></p>');
    assert.equal(out, '<p><strong>hi</strong> <em>there</em></p>');
  });
});

describe('classifyDestination', () => {
  test('reports the tier and destination for a lure', () => {
    assert.deepEqual(classifyDestination('https://evil.test', 'your bank'), {
      tier: 'plain',
      destination: 'evil.test',
    });
  });

  test('reports revealed with no destination for our own hosts', () => {
    assert.deepEqual(classifyDestination('https://pana.social/s', 'the feed'), {
      tier: 'revealed',
      destination: null,
    });
  });

  test('reports impostor when the text claims another domain', () => {
    assert.equal(
      classifyDestination('https://evil.test', 'panamia.club').tier,
      'impostor'
    );
  });

  test('survives a malformed href without throwing', () => {
    assert.deepEqual(classifyDestination('http://[', 'x'), {
      tier: 'revealed',
      destination: null,
    });
  });
});

describe('filenames are not destination claims', () => {
  /* Found by rendering the control rather than by unit test: an ordinary post
     linking to a file by name earned a loud red warning. The earlier test used
     `see index.js`, where the surrounding prose made it not-a-URL; real link
     text is just the filename, and the shape alone is identical to a bare
     domain. Pinning the realistic case, not the one that happened to pass. */
  test('a link labelled with a filename gets a quiet badge, not a warning', () => {
    const out = annotateLinkDestinations(
      sanitizeStatusHtml(
        'The fix is in <a href="https://github.com/o/r">index.js</a>'
      )
    );
    assert.match(out, /data-pana-host="github\.com"/);
    assert.doesNotMatch(out, /data-pana-impostor/);
  });

  test('the destination is still revealed for a filename label', () => {
    // The downgrade must only change volume. Losing the host would turn a
    // false-alarm fix into a hole.
    assert.equal(
      classifyDestination('https://github.com/o/r', 'index.js').destination,
      'github.com'
    );
  });

  for (const name of ['app.py', 'README.mdx', 'styles.css', 'data.json']) {
    test(`${name} reads as a filename`, () => {
      assert.equal(
        classifyDestination('https://evil.test', name).tier,
        'plain'
      );
    });
  }

  /* The sharp edge. These suffixes are live TLDs, so they stay loud — the
     `.zip`/`.mov` gTLDs exist precisely to blur this line, and text reading
     `invoice.zip` pointing at `evil.zip` is the attack they enabled. */
  for (const name of [
    'invoice.zip',
    'clip.mov',
    'notes.md',
    'main.rs',
    'deploy.sh',
  ]) {
    test(`${name} is still treated as a destination claim`, () => {
      assert.equal(
        classifyDestination('https://evil.test', name).tier,
        'impostor'
      );
    });
  }

  test('an explicit scheme overrides the filename exemption', () => {
    assert.equal(
      classifyDestination('https://evil.test', 'https://index.js').tier,
      'impostor'
    );
  });
});
