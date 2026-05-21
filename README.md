# SharedSpace Video Library

A Firebase-backed app for collecting videos, saving transcripts, and tracking whether each video has already been used for content.

## Features

- Google sign-in with Firebase Authentication.
- Firestore database per user: `users/{uid}/videos`.
- Firebase Storage uploads for video, audio, image, or PDF reference files.
- Thumbnail support with automatic YouTube thumbnails, first-frame thumbnails for uploaded videos, and manual thumbnail URL/image upload for sources like Facebook.
- Facebook and Instagram links cannot expose first-frame thumbnails directly to a browser-only app, so those items show a clear thumbnail-needed state and support manual thumbnail upload or image URL.
- AI title suggestions through a local OpenAI-backed API route. The app can suggest short literal titles from URL, platform, transcript, notes, filename, and thumbnail.
- Add, search, filter, edit, and delete video items.
- Click any item to edit its transcript and mark whether it was already used for content.
- Autosaves item edits from the detail panel.

## Run locally

```bash
npm run dev
```

Then open:

```text
http://localhost:5173
```

## Firebase setup

The app uses the Firebase config in `app.js`.

## OpenAI title setup

The OpenAI API key must stay on the local server, not in browser JavaScript.

Create a `.env` file:

```text
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_TITLE_MODEL=gpt-4.1-nano
```

Then restart the app:

```bash
npm run dev
```

If `OPENAI_API_KEY` is missing, the app still works, but AI title suggestions will show a setup error.

Before using real data, publish the included rules:

- `firestore.rules`
- `storage.rules`

Also make sure `localhost` is allowed in Firebase Authentication authorized domains while testing locally.

If saving a video says you do not have sufficient permissions, Firestore is still using restrictive rules in the Firebase console. Paste the contents of `firestore.rules` into Firestore Database > Rules and publish them. Do the same with `storage.rules` in Storage > Rules before uploading files.
