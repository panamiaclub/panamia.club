# Mastodon Comments

Enable comments on your published articles using Mastodon. Instead of building a custom comment system, Pana MIA displays replies to your Mastodon post as comments below your article.

## How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Publish your   │────▶│  Share article   │────▶│  Paste post URL │
│    article      │     │  on Mastodon     │     │  in settings    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                          │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ Comments appear │◀────│ Pana MIA fetches │◀────│ Readers reply   │
│ below article   │     │ replies via API  │     │ on Mastodon     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Setup Guide

### Step 1: Publish Your Article

First, publish your article on Pana MIA as usual. The Mastodon comments feature only works with published articles.

### Step 2: Share on Mastodon

Share your article link on your Mastodon account. Write a compelling post that encourages discussion:

```
New article: "The State of Miami's Music Scene"

I explore the underground venues, emerging artists, and what makes
our local music community unique.

Read it here: https://panamia.club/articles/miami-music-scene

What's your favorite local venue?
```

### Step 3: Copy Your Post URL

After posting, click on your post to open it in a new tab. Copy the URL from your browser's address bar. It will look something like:

```
https://mastodon.social/@yourname/123456789012345678
```

Supported URL formats:

- `https://mastodon.social/@user/123456789`
- `https://fosstodon.org/@user/123456789`
- `https://hachyderm.io/@user/123456789`
- Any Mastodon-compatible instance

### Step 4: Link Your Post

1. Go to your published article on Pana MIA
2. Scroll down and click **"Author Settings"** (only visible to you as the author)
3. Expand the settings panel
4. Paste your Mastodon post URL in the input field
5. Click **Save**

You'll see a confirmation that comments are enabled.

### Step 5: View Comments

Once linked, any replies to your Mastodon post will appear as comments below your article. Comments include:

- Author's display name and avatar
- Their Mastodon handle (@user@instance)
- Comment content
- Link to view on Mastodon
- Reply count for nested threads

## Features

### For Authors

| Feature             | Description                               |
| ------------------- | ----------------------------------------- |
| Easy setup          | Just paste your post URL                  |
| Any instance        | Works with any Mastodon-compatible server |
| Update anytime      | Change or remove the linked post          |
| Built-in moderation | Mastodon's moderation tools apply         |

### For Readers

| Feature           | Description                                            |
| ----------------- | ------------------------------------------------------ |
| No account needed | Read comments without signing in                       |
| Reply on Mastodon | Click to reply from your Mastodon account              |
| Refresh button    | Get the latest comments                                |
| View threads      | See reply counts and click through to full discussions |

## Frequently Asked Questions

### Do I need a Mastodon account?

**Authors**: Yes, you need a Mastodon account to share your article and enable comments.

**Readers**: No account needed to read comments. To reply, they'll need a Mastodon account.

### Which Mastodon instances are supported?

Any Mastodon-compatible instance works, including:

- mastodon.social
- fosstodon.org
- hachyderm.io
- infosec.exchange
- And thousands more...

### How often are comments updated?

Comments are cached for 5 minutes to reduce API load. Click the **Refresh** button to fetch the latest comments.

### Can I moderate comments?

Moderation happens on Mastodon. You can:

- Delete replies to your post
- Block users
- Report content
- Mute conversations

Comments removed on Mastodon will disappear from your article on the next refresh.

### What if I delete my post?

If you delete your Mastodon post, comments will no longer load. You can:

1. Create a new post announcing your article
2. Update the linked URL in Author Settings

### Can I have multiple posts for one article?

Currently, only one post can be linked per article. The most recent post you link will be used.

### Are there rate limits?

Mastodon instances typically allow 300 requests per 5 minutes. With caching, this is rarely an issue. If you see an error, wait a few minutes and try again.

## Technical Details

### API Endpoints

| Endpoint                        | Method | Description                              |
| ------------------------------- | ------ | ---------------------------------------- |
| `/api/articles/[slug]/comments` | GET    | Fetch comments from linked Mastodon post |
| `/api/articles/[slug]/mastodon` | GET    | Get the linked post URL                  |
| `/api/articles/[slug]/mastodon` | PATCH  | Update the linked post URL (author only) |

### Data Flow

1. Author saves post URL → stored in `article.mastodonPostUrl`
2. Page loads → client fetches `/api/articles/[slug]/comments`
3. API parses URL → extracts instance and status ID
4. API calls Mastodon → `GET /api/v1/statuses/{id}/context`
5. API transforms data → returns simplified comment objects
6. Component renders → displays comments with avatars

### Privacy Considerations

- Only **public** Mastodon posts and replies are fetched
- No authentication is sent to Mastodon (public API only)
- User data comes directly from Mastodon's API
- Avatars are loaded from the user's Mastodon instance
- No comment data is stored in Pana MIA's database

## Troubleshooting

### "Invalid Mastodon URL" error

Make sure your URL:

- Starts with `https://`
- Contains a valid Mastodon instance domain
- Ends with a numeric status ID
- Follows the format `https://instance/@user/123456789`

### Comments not loading

1. Check that your post is **public** (not followers-only or unlisted)
2. Verify the post hasn't been deleted
3. Wait 5 minutes and refresh (rate limiting)
4. Check the Mastodon instance is online

### "Failed to fetch comments" error

This usually means:

- The Mastodon instance is temporarily unavailable
- The post was deleted
- Network connectivity issues

Try refreshing after a few minutes.

## Future Improvements

- **Threaded display**: Show nested reply threads inline
- **Reply from Pana MIA**: Open Mastodon reply dialog directly
- **Multiple posts**: Link multiple announcements per article
- **Analytics**: Show engagement metrics (boosts, favorites)

---

See also: [ARTICLE-ROADMAP.md](./ARTICLE-ROADMAP.md) for the full articles feature roadmap.
