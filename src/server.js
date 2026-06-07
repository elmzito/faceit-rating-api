import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";

const app = express();

const PORT = Number(process.env.PORT || 3000);
const FACEIT_API_KEY = process.env.FACEIT_API_KEY;

const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 2 * 60 * 1000);
const FACEIT_API_BASE = "https://open.faceit.com/data/v4";

const matchCache = new Map();

app.set("trust proxy", 1);
app.use(helmet());
app.use(express.json());
app.use(morgan("tiny"));

function getAllowedOrigins() {
  const fromEnv = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(origin => origin.trim())
    .filter(Boolean);

  return new Set([
    "https://www.faceit.com",
    "https://faceit.com",
    ...fromEnv
  ]);
}

function isAllowedOrigin(origin) {
  if (!origin) return true;

  if (origin.startsWith("chrome-extension://")) return true;

  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.has(origin)) return true;

  try {
    const url = new URL(origin);
    if (url.hostname === "faceit.com" || url.hostname.endsWith(".faceit.com")) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["GET", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false
}));

const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60 * 1000),
  limit: Number(process.env.RATE_LIMIT_MAX || 120),
  standardHeaders: true,
  legacyHeaders: false
});

app.use("/api", limiter);

function getCached(key) {
  const cached = matchCache.get(key);
  if (!cached) return null;

  if (Date.now() - cached.at > CACHE_TTL_MS) {
    matchCache.delete(key);
    return null;
  }

  return cached.value;
}

function setCached(key, value) {
  matchCache.set(key, {
    at: Date.now(),
    value
  });
}

function normalizePlayer(player) {
  return {
    playerId: player.player_id || player.id || null,
    nickname: player.nickname || player.name || player.game_player_name || null,
    avatar: player.avatar || null,
    country: player.country || null,
    gamePlayerName: player.game_player_name || null,
    membership: player.membership || null
  };
}

function normalizeTeam(team, index) {
  const players = Array.isArray(team.roster) ? team.roster : [];

  return {
    teamId: team.faction_id || team.id || `team_${index + 1}`,
    name: team.name || team.faction_name || `Team ${index + 1}`,
    players: players
      .map(normalizePlayer)
      .filter(player => player.playerId && player.nickname)
  };
}

function normalizeMatch(match) {
  const rawTeams = [
    match?.teams?.faction1,
    match?.teams?.faction2
  ].filter(Boolean);

  const teams = rawTeams.map(normalizeTeam);

  return {
    matchId: match.match_id || match.id || null,
    game: match.game || "cs2",
    status: match.status || null,
    competitionName: match.competition_name || null,
    region: match.region || null,
    teams
  };
}

function isValidMatchId(matchId) {
  return typeof matchId === "string" && /^[a-zA-Z0-9_-]+$/.test(matchId) && matchId.length <= 80;
}

async function faceitGet(path) {
  if (!FACEIT_API_KEY) {
    throw new Error("Missing FACEIT_API_KEY environment variable.");
  }

  const response = await fetch(`${FACEIT_API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${FACEIT_API_KEY}`,
      Accept: "application/json"
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`FACEIT API HTTP ${response.status}: ${text.slice(0, 250)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`FACEIT API returned non-JSON: ${text.slice(0, 250)}`);
  }
}

app.get("/", (_req, res) => {
  res.json({
    name: "FACEIT Rating API",
    status: "ok",
    endpoints: [
      "/health",
      "/api/match/:matchId/players"
    ]
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    faceitKeyConfigured: Boolean(FACEIT_API_KEY),
    uptimeSeconds: Math.round(process.uptime())
  });
});

app.get("/api/match/:matchId/players", async (req, res) => {
  const { matchId } = req.params;

  if (!isValidMatchId(matchId)) {
    res.status(400).json({
      error: "Invalid matchId."
    });
    return;
  }

  const cacheKey = `match:${matchId}`;
  const cached = getCached(cacheKey);

  if (cached) {
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json({
      ...cached,
      cached: true
    });
    return;
  }

  try {
    const match = await faceitGet(`/matches/${encodeURIComponent(matchId)}`);
    const normalized = normalizeMatch(match);

    if (!normalized.teams.length) {
      res.status(404).json({
        error: "No teams found for this match."
      });
      return;
    }

    const result = {
      ...normalized,
      cached: false,
      updatedAt: new Date().toISOString()
    };

    setCached(cacheKey, result);

    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(result);
  } catch (error) {
    console.error("Failed to fetch match players:", error);

    res.status(500).json({
      error: "Failed to fetch match players.",
      details: process.env.NODE_ENV === "production" ? undefined : error.message
    });
  }
});

app.use((_req, res) => {
  res.status(404).json({
    error: "Not found."
  });
});

app.use((error, _req, res, _next) => {
  console.error("Unhandled error:", error);

  res.status(500).json({
    error: "Internal server error."
  });
});

app.listen(PORT, () => {
  console.log(`FACEIT Rating API running on port ${PORT}`);
});
