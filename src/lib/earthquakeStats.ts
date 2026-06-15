import { differenceInDays } from "date-fns";

export interface EarthquakeInfo {
  id: string;
  time: string;
  lat: number;
  lon: number;
  depth: number;
  magType: string;
  mag: number;
  place: string;
}

export interface GridCellStats {
  latStart: number;
  latEnd: number;
  lonStart: number;
  lonEnd: number;
  eventsCount: number;
  originalEventsCount: number;
  dailyPoissonProb: number;
  dailyPoissonProbLow: number;
  dailyPoissonProbHigh: number;
  meanReturnTimeDays: number;
  daysSinceLastEvent: number | null;
  cumulativePoissonProb: number | null;
  cumulativePoissonProbLow: number | null;
  cumulativePoissonProbHigh: number | null;
  recentEvents: EarthquakeInfo[];
  latestEventTime?: string;
}

export const MIN_LAT = 35;
export const MAX_LAT = 48;
export const MIN_LON = 6;
export const MAX_LON = 19;
export const START_YEAR = 1985;
const START_DATE = new Date(`${START_YEAR}-01-01T00:00:00Z`);
const NOW = new Date();
export const TOTAL_DAYS = differenceInDays(NOW, START_DATE);

export function generateGridAndStats(allEarthquakes: EarthquakeInfo[]): GridCellStats[] {
  const grid: GridCellStats[] = [];

  for (let lat = MIN_LAT; lat < MAX_LAT; lat++) {
    for (let lon = MIN_LON; lon < MAX_LON; lon++) {
      
      const originalEventsInCell = allEarthquakes.filter(eq => 
        eq.lat >= lat && eq.lat < lat + 1 && 
        eq.lon >= lon && eq.lon < lon + 1
      );

      // Using raw catalog since declustering was too slow
      const eventsInCell = originalEventsInCell;

      const count = eventsInCell.length;
      const originalCount = originalEventsInCell.length;
      
      // Poisson parameters based on mainshocks
      const mu = count / TOTAL_DAYS; 
      const sigmaMu = Math.sqrt(count) / TOTAL_DAYS;
      
      const dailyPoissonProb = 1 - Math.exp(-mu);
      const lowMu = Math.max(0, mu - 1.96 * sigmaMu);
      const highMu = mu + 1.96 * sigmaMu;
      const dailyPoissonProbLow = 1 - Math.exp(-lowMu);
      const dailyPoissonProbHigh = 1 - Math.exp(-highMu);

      const meanReturnTimeDays = count > 0 ? TOTAL_DAYS / count : 0;
      let daysSinceLastEvent = null;
      let cumulativePoissonProb = null;
      let cumulativePoissonProbLow = null;
      let cumulativePoissonProbHigh = null;
      let latestEventTime: string | undefined = undefined;

      if (count > 0) {
        const lastEq = eventsInCell[eventsInCell.length - 1];
        latestEventTime = lastEq.time;
        daysSinceLastEvent = Math.max(0, differenceInDays(NOW, new Date(latestEventTime)));
        cumulativePoissonProb = 1 - Math.exp(-mu * daysSinceLastEvent);
        cumulativePoissonProbLow = 1 - Math.exp(-lowMu * daysSinceLastEvent);
        cumulativePoissonProbHigh = 1 - Math.exp(-highMu * daysSinceLastEvent);
      }

      const recentEvents = [...eventsInCell].reverse();

      grid.push({
        latStart: lat,
        latEnd: lat + 1,
        lonStart: lon,
        lonEnd: lon + 1,
        eventsCount: count,
        originalEventsCount: originalCount,
        dailyPoissonProb,
        dailyPoissonProbLow,
        dailyPoissonProbHigh,
        meanReturnTimeDays,
        daysSinceLastEvent,
        cumulativePoissonProb,
        cumulativePoissonProbLow,
        cumulativePoissonProbHigh,
        recentEvents: recentEvents.slice(0, 10), // keep only last 10 for display
        latestEventTime
      });
    }
  }

  return grid;
}
