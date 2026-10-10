# Community Articles

This guide explains how to create, collaborate on, and publish articles on Pana MIA.

## Overview

Community articles let you share business updates, local news, and community commentary with the Pana MIA community. Every article requires collaboration - either a co-author or a reviewer must verify your content before it can be published.

## Article Types

| Type                     | Best For                                  | Example                         |
| ------------------------ | ----------------------------------------- | ------------------------------- |
| **Business Update**      | Promoting your products, services, events | "New Spring Menu at Our Bakery" |
| **Community Commentary** | Opinion, analysis, local interest stories | "The Future of Little Havana"   |
| **Staff Update**         | Official posts from the Pana MIA team     | "Platform Maintenance Schedule" |

> **Staff Update** is an admin-only type. It does not require a reviewer, and a
> co-author is optional — an admin can publish it directly. The type option only
> appears in the editor for admin users.

## Getting Started

### Requirements

Before creating an article, you need:

- A Pana MIA account
- A screenname (set in Account Settings)

### Creating a New Article

1. Navigate to **Articles > New Article** or go to `/articles/new`
2. Enter your article title
3. Select the article type (Business Update or Community Commentary)
4. Add up to 5 tags to help readers find your content
5. Optionally add a cover image URL
6. Write your content using Markdown
7. Click **Save Draft**

### Writing with Markdown

The editor supports standard Markdown formatting:

```markdown
# Heading 1

## Heading 2

### Heading 3

**Bold text** and _italic text_

[Link text](https://example.com)

- Bullet list item
- Another item

1. Numbered list
2. Second item

> Blockquote for emphasis

![Image alt text](https://image-url.com/image.jpg)
```

Use the **Preview** tab to see how your article will look when published.

---

## Collaboration

Most articles cannot be published without collaboration. You have two options:
invite a **co-author** or request a **review**. (The exception is **Staff
Updates** — see [Staff Updates](#staff-updates) — which admins publish
directly.)

> **The collaboration tools live on the edit page and only appear after you
> save the draft the first time.** A brand-new article has no URL yet, so on
> the New Article screen you'll see a reminder to save first; the co-author and
> reviewer search boxes appear once the draft exists (`/a/<slug>/edit`).

> **You never approve your own article.** As the author you only ever see
> **Save Draft** and — once the article is eligible — **Publish**. Accepting a
> co-author invitation and approving a review are done by the _invited_ person
> on their own screens (reached from their notification), not by you.

### Option 1: Invite Co-Authors

Co-authors can edit your article and share credit when published.

**To invite a co-author:**

1. Save your draft first
2. Scroll to the **Collaboration** section
3. Search for a user by their screenname
4. Optionally add a personal message explaining why you're inviting them
5. Send them the invitation link yourself — `/a/<your-slug>/invite`

> **Inviting no longer notifies anyone.** Co-author and review notifications
> were switched off, and there is no index of invitations you have received, so
> the link is the only way the person finds out.

**When someone invites you:**

1. Open the invitation link the author sent you
2. Review the article preview and personal message
3. Click **Accept** to join as co-author, or **Decline** to pass

Once accepted, you can edit the article alongside the original author.

### Option 2: Request a Review

Reviewers verify your article's accuracy without becoming co-authors.

**To request a review:**

1. Save your draft first
2. Scroll to the **Collaboration** section under **Review**
3. Search for a user by their screenname
4. Send them the review link yourself — `/a/<your-slug>/review`. Requesting a
   review does not notify them

**When someone requests your review:**

1. Open the review link the author sent you
2. Read the full article
3. Complete the review checklist:
   - Facts and claims have been verified
   - Sources are credible and properly attributed
   - Meets community standards and guidelines
4. Add comments if you have feedback
5. Click **Approve Article** or **Request Revisions**

### Tracking Pending Invitations

The edit page has a **Pending Invitations** panel near the bottom listing every
co-author or reviewer you've invited who hasn't yet responded. It reflects the
article's saved state, so:

- If someone you invited appears there with a **Pending** badge, the invitation
  was recorded and is waiting on them.
- If the panel says **"No pending invitations"** right after you invited
  someone, the invitation didn't save — try again and watch for an error
  message at the top of the editor.

Pending invitations do **not** count toward publishing and are **not** credited
on the published article — only _accepted_ co-authors and an _approved_ reviewer
appear once it's live.

---

## Article Workflow

```
Draft
  │
  ├─► Invite Co-Author ─► Pending ─► Accepted ─► Ready to Publish
  │                              └─► Declined
  │
  └─► Request Review ─► Pending ─► Approved ─► Ready to Publish
                              └─► Revision Needed ─► (make changes) ─► Re-request
```

### Status Meanings

| Status               | Meaning                                    |
| -------------------- | ------------------------------------------ |
| **Draft**            | You're still working on it                 |
| **Pending**          | Waiting for co-author or reviewer response |
| **Revision Needed**  | Reviewer requested changes                 |
| **Ready to Publish** | Has accepted co-author OR approved review  |
| **Published**        | Live and visible to everyone               |
| **Removed**          | Taken down by admin                        |

---

## Publishing

### Eligibility

For Business Update and Community Commentary articles, the **Publish** button
only appears once the article has a title, content, and **at least one accepted
co-author OR an approved review**. Until then you'll only see **Save Draft** and
a "Waiting for co-author acceptance or reviewer approval" indicator — there is
no separate "Approve" button in your editor (approval happens on the invitee's
side, as described under [Collaboration](#collaboration)).

**Staff Updates** skip this gate entirely — see [Staff Updates](#staff-updates).

### Publishing your article

1. Open your article in the editor (`/a/<slug>/edit`)
2. Verify the "Ready to publish" indicator is shown
3. Click **Publish**

**If any invitations are still pending** when you publish, a confirmation
dialog lists them and warns they will **not** appear as co-authors or reviewers
on the published article. You can **Keep waiting** for them to respond, or
**Publish anyway** without them.

Published articles appear on the public articles page and in RSS feeds.

### Cross-posting to the Pana Resilience Network

Publishing also cross-posts the article to the
[Pana Resilience Network](/features#resilience) as a Nostr long-form note
(NIP-23), mirrored across the community relay. This happens automatically on
publish; it does not block publishing if the relay is unreachable.

### After Publishing

- Published articles cannot be edited (you must unpublish first)
- Other users can write reply articles
- Admins can remove articles that violate community guidelines

---

## Staff Updates

**Staff Update** is an official post from the Pana MIA team. It behaves like the
other article types with two differences:

- **Admin-only.** The "Staff Update" type only appears in the editor's type
  dropdown for admin users, and the API rejects the type from non-admins.
- **No collaboration required to publish.** Reviewers do not apply, and a
  co-author is optional — an admin can publish a Staff Update directly, without
  an accepted co-author or approved review. (A co-author can still be invited if
  desired.)

Everything else — tags, cover image, the public article page, RSS/JSON feeds,
and the Nostr cross-post — works the same as other types.

---

## Managing Your Articles

View all your articles at `/account/articles`. In the header menu, the
**My Articles** heading (in the Articles section) links straight there. This is
the only place drafts are listed — a draft is not reachable from its public URL
(`/a/<slug>` shows published articles only), so use this dashboard or the direct
edit link (`/a/<slug>/edit`) to get back to a draft.

From here you can:

- See article status at a glance
- Open articles for editing
- Delete draft articles
- View published articles

---

## Best Practices

### For Authors

- **Be accurate**: Verify facts before publishing
- **Add context**: Explain why your topic matters to the community
- **Use clear titles**: Help readers know what to expect
- **Tag appropriately**: Use relevant tags, not trending ones
- **Respond to feedback**: Address reviewer comments thoughtfully

### For Co-Authors

- **Review the full article**: You share responsibility for the content
- **Suggest improvements**: Don't just rubber-stamp
- **Communicate**: Discuss changes with the original author

### For Reviewers

- **Take it seriously**: Your approval means you've verified the content
- **Be constructive**: Explain what needs improvement
- **Check sources**: Don't assume claims are accurate
- **Be timely**: Authors are waiting on your response

---

## Frequently Asked Questions

**Q: Can I change my article after publishing?**
A: You must unpublish first, make changes, then republish. This ensures all published content has been reviewed.

**Q: What if my reviewer never responds?**
A: You can request a review from a different user. The original request will remain pending.

**Q: Can I be both a co-author and reviewer?**
A: No. If you're invited as a co-author, you cannot also review the article.

**Q: What happens if a co-author declines?**
A: You can invite someone else. You need at least one accepted co-author OR an approved review to publish.

**Q: Can admins edit my article?**
A: No. Admins can only remove articles that violate guidelines. They cannot modify content.

**Q: How do I report a problematic article?**
A: Contact the admin team through the Contact Us form.
