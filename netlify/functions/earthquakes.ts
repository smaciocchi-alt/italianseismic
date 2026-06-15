import { Handler } from "@netlify/functions";

export const handler: Handler = async (event, context) => {
  const START_YEAR = 1985;
  const url = `https://webservices.ingv.it/fdsnws/event/1/query?minlat=35&maxlat=48&minlon=6&maxlon=19&minmag=4&starttime=${START_YEAR}-01-01&format=text`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        statusCode: response.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: `INGV API returned status ${response.statusText}` }),
      };
    }
    
    const text = await response.text();
    const lines = text.trim().split('\n');
    const events = [];
    
    // The first line contains column headers, data starts on line 1 (second line)
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
          place: parts[12],
        });
      }
    }
    
    // Sort earthquakes chronologically
    const sorted = events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        // Optimize: Let Netlify's global CDN edge nodes cache this response for up to 1 hour (3600 seconds)
        // This ensures super-fast response times and protects INGV endpoints from excess load.
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=600",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        data: sorted,
        lastUpdate: new Date().toISOString(),
        startYear: START_YEAR,
      }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: error.message || "Internal server error" }),
    };
  }
};
