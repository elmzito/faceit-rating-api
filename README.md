# FACEIT Rating API

Backend API for the FACEIT Rating Chrome extension.

The Chrome extension calls this backend to get matchroom players/rosters.
The backend uses the official FACEIT Data API with your private `FACEIT_API_KEY`.

## Endpoints

### Health

```txt
GET /health
```

### Match players

```txt
GET /api/match/:matchId/players
```

Example:

```txt
GET /api/match/1-273fc942-1c2e-43e2-b702-6ca45c445682/players
```

## Local setup

Install dependencies:

```bash
npm install
```

Create `.env`:

```bash
cp .env.example .env
```

Edit `.env` and add your FACEIT API key:

```env
FACEIT_API_KEY=your_key_here
```

Run locally:

```bash
npm run dev
```

Test:

```txt
http://localhost:3000/health
```

## Deploy on Render

Create a new **Web Service** on Render.

Use:

```txt
Build Command: npm install
Start Command: npm start
```

Add environment variable:

```env
FACEIT_API_KEY=your_key_here
```

After deploy, test:

```txt
https://your-render-url.onrender.com/health
```

## Connect extension

In the extension `content.js`, change:

```js
const API_BASE = "http://localhost:3000/api";
```

to:

```js
const API_BASE = "https://your-render-url.onrender.com/api";
```

In `manifest.json`, change host permissions from:

```json
"http://localhost:3000/*"
```

to:

```json
"https://your-render-url.onrender.com/*"
```

## Important

Never commit `.env`.

Your FACEIT API key must only exist on Render as an environment variable.
