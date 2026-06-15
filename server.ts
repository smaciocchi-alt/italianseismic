import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

let earthquakes: any[] = [];
let lastFetchTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const START_YEAR = 1985;

// Parse INGV text format to JSON
function parseIngvText(text: string) {
  const lines = text.trim().split('\n');
  const events = [];
  // first line is header
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split('|');
    if (parts.length >= 11) {
      events.push({
        id: parts[0],
        time: parts[1],
        lat: parseFloat(parts[2]),
        lon: parseFloat(parts[3]),
        depth: parseFloat(parts[4]),
        magType: parts[9],
        mag: parseFloat(parts[10]),
        place: parts[12]
      });
    }
  }
  return events;
}

let fetchPromise: Promise<void> | null = null;

async function fetchEarthquakes() {
  const url = `https://webservices.ingv.it/fdsnws/event/1/query?minlat=35&maxlat=48&minlon=6&maxlon=19&minmag=4&starttime=${START_YEAR}-01-01&format=text`;
  try {
    console.log("Fetching INGV data...");
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`INGV API error: ${response.statusText}`);
    }
    const text = await response.text();
    const parsed = parseIngvText(text);
    earthquakes = parsed.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    lastFetchTime = Date.now();
    console.log(`Fetched ${earthquakes.length} earthquakes.`);
  } catch (error) {
    console.error("Error fetching earthquakes:", error);
  }
}

function triggerFetch() {
  if (!fetchPromise) {
    fetchPromise = fetchEarthquakes().finally(() => {
      fetchPromise = null;
    });
  }
  return fetchPromise;
}

// Initial fetch
triggerFetch();

app.get("/api/earthquakes", async (req, res) => {
  if (earthquakes.length === 0) {
    // Wait for the first fetch to complete before responding
    if (fetchPromise) {
      await fetchPromise;
    } else if (Date.now() - lastFetchTime > CACHE_TTL) {
      await triggerFetch();
    }
  } else if (Date.now() - lastFetchTime > CACHE_TTL) {
    // Re-fetch in background
    triggerFetch().catch(console.error);
  }
  res.json({
    data: earthquakes,
    lastUpdate: new Date(lastFetchTime).toISOString(),
    startYear: START_YEAR
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
