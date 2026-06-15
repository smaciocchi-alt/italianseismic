/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { generateGridAndStats, GridCellStats, EarthquakeInfo, TOTAL_DAYS } from './lib/earthquakeStats';
import Map from './components/Map';
import { Activity, AlertTriangle, Clock, MapPin, RefreshCw, Info } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

export default function App() {
  const [data, setData] = useState<EarthquakeInfo[]>(() => {
    try {
      const cached = localStorage.getItem('seismic_data');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [lastUpdate, setLastUpdate] = useState<string>(() => {
    try {
      return localStorage.getItem('seismic_last_update') || '';
    } catch {
      return '';
    }
  });
  const [dataSource, setDataSource] = useState<'cache' | 'api' | 'fallback' | 'none'>(() => {
    try {
      const cached = localStorage.getItem('seismic_data');
      return cached ? 'cache' : 'none';
    } catch {
      return 'none';
    }
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCell, setSelectedCell] = useState<GridCellStats | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      try {
        const res = await fetch('/api/earthquakes');
        if (res.ok) {
          const json = await res.json();
          setData(json.data);
          const updateTime = json.lastUpdate || new Date().toISOString();
          setLastUpdate(updateTime);
          setDataSource('api');
          try {
            localStorage.setItem('seismic_data', JSON.stringify(json.data));
            localStorage.setItem('seismic_last_update', updateTime);
          } catch (storageErr) {
            console.warn('Could not save to localStorage:', storageErr);
          }
          return;
        }
        console.warn('API /api/earthquakes returned non-ok status, attempting direct client-side fallback to INGV...');
      } catch (apiErr) {
        console.warn('API /api/earthquakes fetch failed, attempting direct client-side fallback to INGV...', apiErr);
      }

      // NATIVE DIRECT FALLBACK TO INGV (e.g. for static hostings like Netlify)
      const START_YEAR = 1985;
      const url = `https://webservices.ingv.it/fdsnws/event/1/query?minlat=35&maxlat=48&minlon=6&maxlon=19&minmag=4&starttime=${START_YEAR}-01-01&format=text`;
      const resIngv = await fetch(url);
      if (!resIngv.ok) {
        throw new Error(`Direct INGV API call failed with status: ${resIngv.statusText}`);
      }
      const text = await resIngv.text();
      const lines = text.trim().split('\n');
      const events: EarthquakeInfo[] = [];
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
      const sorted = events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
      setData(sorted);
      const updateTime = new Date().toISOString();
      setLastUpdate(updateTime);
      setDataSource('fallback');
      try {
        localStorage.setItem('seismic_data', JSON.stringify(sorted));
        localStorage.setItem('seismic_last_update', updateTime);
      } catch (storageErr) {
        console.warn('Could not save to localStorage:', storageErr);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading earthquake data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto update every hour
    const interval = setInterval(fetchData, 3600000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const gridStats = useMemo(() => generateGridAndStats(data), [data]);

  const highestHazardCell = useMemo(() => {
    if (gridStats.length === 0) return null;
    return [...gridStats].sort((a, b) => (b.cumulativePoissonProb || 0) - (a.cumulativePoissonProb || 0))[0];
  }, [gridStats]);

  const globalStats = useMemo(() => {
    const totalEvents = data.length;
    if (totalEvents === 0) return null;
    
    // Poisson
    const mu = totalEvents / TOTAL_DAYS;
    const se = Math.sqrt(totalEvents) / TOTAL_DAYS;
    const dailyPoissonProb = 1 - Math.exp(-mu);
    const dailyPoissonProbLow = 1 - Math.exp(-Math.max(0, mu - 1.96 * se));
    const dailyPoissonProbHigh = 1 - Math.exp(-(mu + 1.96 * se));

    const sortedEvents = [...data].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    const lastEq = sortedEvents[sortedEvents.length - 1];
    let cumulativePoissonProb = null;
    let cumulativePoissonProbLow = null;
    let cumulativePoissonProbHigh = null;
    
    if (lastEq) {
      const daysSinceLastEvent = Math.max(0, differenceInDays(new Date(), new Date(lastEq.time)));
      cumulativePoissonProb = 1 - Math.exp(-mu * daysSinceLastEvent);
      cumulativePoissonProbLow = 1 - Math.exp(-Math.max(0, mu - 1.96 * se) * daysSinceLastEvent);
      cumulativePoissonProbHigh = 1 - Math.exp(-(mu + 1.96 * se) * daysSinceLastEvent);
    }
    
    return {
      totalEvents,
      dailyPoissonProb,
      dailyPoissonProbLow,
      dailyPoissonProbHigh,
      cumulativePoissonProb,
      cumulativePoissonProbLow,
      cumulativePoissonProbHigh
    };
  }, [data]);

  const latestEvent = useMemo(() => {
    if (data.length === 0) return null;
    return [...data].reduce((prev, current) => {
      return (new Date(current.time).getTime() > new Date(prev.time).getTime()) ? current : prev;
    });
  }, [data]);

  return (
    <div className="flex flex-col h-screen w-full bg-[#0c0d0e] text-[#e0e2e4] overflow-hidden font-sans select-none">
      {/* Header Section */}
    <header className="flex items-center justify-between px-6 py-3 border-b border-[#2a2d30] bg-[#151719] shrink-0">
      <div className="flex items-center gap-4">
        <div className="w-3 h-3 bg-[#ff4e00] rounded-full animate-pulse"></div>
        <h1 className="text-lg font-bold tracking-tight uppercase font-mono">Italian Seismic Hazard Map</h1>
      </div>
      <div className="flex gap-8 text-[11px] font-mono">
        <div className="flex flex-col items-end">
          <span className="text-[#9ca3af] uppercase font-semibold">Highest Current Risk Grid</span>
          <span className="text-[#ff4e00]">
            {highestHazardCell ? `Grid ${highestHazardCell.latStart}°N, ${highestHazardCell.lonStart}°E (Last: ${highestHazardCell.latestEventTime ? format(new Date(highestHazardCell.latestEventTime), 'yyyy-MM-dd') : '--'})` : '--'}
          </span>
        </div>
          <div className="flex flex-col items-end">
            <span className="text-[#9ca3af] uppercase font-semibold">Sync Status / Source</span>
            <div className="flex items-center gap-2">
              {loading ? (
                <span className="text-[#ffb344] animate-pulse text-[10px] font-semibold bg-[#3b2a0a] border border-[#ffb344]/30 px-1.5 py-0.5 rounded">SYNCING...</span>
              ) : error ? (
                <span className="text-red-500 text-[10px] font-semibold bg-red-950 border border-red-800 px-1.5 py-0.5 rounded">ERROR</span>
              ) : (
                <span className="text-[#44ff44] text-[10px] font-semibold uppercase bg-[#0f2d11] border border-[#44ff44]/30 px-1.5 py-0.5 rounded">
                  {dataSource === 'api' ? 'Netlify API' : dataSource === 'fallback' ? 'INGV Fallback' : dataSource === 'cache' ? 'Local Cache' : 'System Ready'}
                </span>
              )}
              <span className="text-[#3c3f43]">|</span>
              <span className="text-[#a0a4a8] text-[11px] font-mono">
                {lastUpdate ? format(new Date(lastUpdate), 'HH:mm:ss') : '--:--:--'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* Sidebar Left: Analytics & Model Comparison */}
        <aside className="w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-[#2a2d30] bg-[#111315] p-4 flex flex-col gap-6 overflow-y-auto shrink-0 z-10">
          <div>
            <h2 className="text-xs uppercase tracking-widest text-[#f3f4f6] mb-3 border-b border-[#3b3f43] pb-1.5 font-mono font-bold">Aggregate Analysis</h2>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#1c1f23] p-2 rounded border border-[#2a2d30]">
                <div className="text-[9px] text-[#9ca3af] uppercase font-semibold">Events M≥4.0</div>
                <div className="text-xl font-mono text-[#e0e2e4]">
                  {gridStats.reduce((sum, c) => sum + c.eventsCount, 0).toLocaleString()}
                </div>
              </div>
              <div className="bg-[#1c1f23] p-2 rounded border border-[#2a2d30]">
                <div className="text-[9px] text-[#9ca3af] uppercase font-semibold">Highest Prob By Now</div>
                <div className="text-xl font-mono text-[#ff4e00]">
                  {highestHazardCell && highestHazardCell.cumulativePoissonProb !== null ? (highestHazardCell.cumulativePoissonProb * 100).toFixed(2) : '--'}%
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-xs uppercase tracking-widest text-[#f3f4f6] mb-3 border-b border-[#3b3f43] pb-1.5 font-mono font-bold">Model Summary</h2>
            <div className="space-y-3">
              {globalStats && (
                <div className="bg-[#1c1f23] p-2 rounded border border-[#2a2d30] mt-2">
                  <div className="text-[11px] font-semibold text-[#8e9299] uppercase mb-1 border-b border-[#2a2d30] pb-1">National Aggregate Risk (M≥4.0)</div>
                  <div className="flex justify-between items-center text-xs font-mono mt-1">
                    <span className="text-[#cbd5e1] font-medium">Daily Poisson:</span>
                    <span className="text-[#e0e2e4]">{(globalStats.dailyPoissonProb * 100).toFixed(4)}%</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] font-mono mt-0.5 text-[#9ca3af]">
                    <span>95% CI:</span>
                    <span>[{(globalStats.dailyPoissonProbLow * 100).toFixed(4)}% - {(globalStats.dailyPoissonProbHigh * 100).toFixed(4)}%]</span>
                  </div>
                  {globalStats.cumulativePoissonProb !== null && (
                    <>
                      <div className="flex justify-between items-center text-[11px] font-mono mt-1 text-[#ff4e00] font-semibold">
                        <span>Prob. by now:</span>
                        <span>{(globalStats.cumulativePoissonProb * 100).toFixed(2)}%</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] font-mono mt-0.5 text-[#9ca3af]">
                        <span>95% CI:</span>
                        <span>[{(globalStats.cumulativePoissonProbLow! * 100).toFixed(2)}% - {(globalStats.cumulativePoissonProbHigh! * 100).toFixed(2)}%]</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {latestEvent && (
            <div>
              <h2 className="text-xs uppercase tracking-widest text-[#f3f4f6] mb-3 border-b border-[#3b3f43] pb-1.5 font-mono font-bold">Latest Event</h2>
              <div className="bg-[#1c1f23] p-3 rounded border border-[#2a2d30] space-y-2">
                <div className="flex justify-between items-start gap-1">
                  <span className="text-xs text-[#e0e2e4] font-semibold uppercase truncate block" title={latestEvent.place}>
                    {latestEvent.place || "Unknown Location"}
                  </span>
                  <span className="text-[11px] font-mono font-bold text-[#ff4e00] bg-[#3a1a0a] px-1.5 py-0.5 border border-red-900 rounded shrink-0">
                    M {latestEvent.mag.toFixed(1)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#2a2d30]/50 text-[10px] font-mono text-[#9ca3af]">
                  <div>
                    <span className="block text-[8px] uppercase text-[#8e9299] font-semibold">Date & Time</span>
                    <span className="text-[#e0e2e4]">{format(new Date(latestEvent.time), 'yyyy-MM-dd HH:mm')}</span>
                  </div>
                  <div>
                    <span className="block text-[8px] uppercase text-[#8e9299] font-semibold">Depth</span>
                    <span className="text-[#e0e2e4]">{latestEvent.depth.toFixed(1)} km</span>
                  </div>
                  <div>
                    <span className="block text-[8px] uppercase text-[#8e9299] font-semibold">Latitude</span>
                    <span className="text-[#e0e2e4]">{latestEvent.lat.toFixed(4)}°N</span>
                  </div>
                  <div>
                    <span className="block text-[8px] uppercase text-[#8e9299] font-semibold">Longitude</span>
                    <span className="text-[#e0e2e4]">{latestEvent.lon.toFixed(4)}°E</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-auto">
            {highestHazardCell && highestHazardCell.cumulativePoissonProb !== null && highestHazardCell.cumulativePoissonProb > 0.5 ? (
              <div className="p-3 border border-red-900 bg-[#3a1a0a] rounded-lg">
                <div className="text-xs font-mono text-[#ff4e00] mb-2 underline tracking-wider font-semibold">SYSTEM ALERT</div>
                <p className="text-sm text-[#e0e2e4] leading-relaxed">
                  Elevated seismicity risk detected at Grid {highestHazardCell.latStart}°N, {highestHazardCell.lonStart}°E. <br/>
                  High probability to have occurred by now.
                </p>
              </div>
            ) : (
              <div className="p-3 border border-[#2a2d30] bg-[#1c1f23] rounded-lg text-[#8e9299]">
                <div className="text-xs font-mono text-[#cbd5e1] mb-2 underline tracking-wider font-semibold">SYSTEM STATUS</div>
                <p className="text-sm leading-relaxed flex items-center gap-1">
                  Baseline hazard levels nominal. Probability rates within standard operational bounds.
                </p>
              </div>
            )}
          </div>
        </aside>

        {/* Central Map Area */}
        <section className="flex-1 relative flex flex-col min-h-[50vh]">
          {/* Map Header/Legend */}
          <div className="absolute top-4 right-4 z-10 flex gap-4 bg-[#151719]/90 backdrop-blur border border-[#2a2d30] p-3 rounded shadow-2xl">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-transparent border border-[#44ff44]"></div>
              <span className="text-[9px] uppercase text-[#8e9299]">Low Risk</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#fd8d3c]/60 border border-[#fd8d3c]"></div>
              <span className="text-[9px] uppercase text-[#8e9299]">Med Risk</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#800026] border border-white"></div>
              <span className="text-[9px] uppercase text-[#8e9299]">High Risk</span>
            </div>
          </div>

          <div className="flex-1 w-full h-full bg-[#08090a] z-0 relative">
            {loading && data.length === 0 ? (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#08090a]/80 backdrop-blur-sm">
                <div className="w-8 h-8 border-2 border-[#ff4e00] border-t-transparent rounded-full animate-spin mb-4"></div>
                <div className="text-[#ff4e00] font-mono text-[10px] uppercase tracking-widest text-center animate-pulse">
                  Acquiring Historical INGV Data...<br/>
                  <span className="text-[#6b7280]">(Optimizing Poisson-Weibull Parameters)</span>
                </div>
              </div>
            ) : null}
            <Map grid={gridStats} onCellClick={setSelectedCell} />
          </div>

          {/* Detailed Info Panel (Bottom Over Map) */}
          <div className="h-auto md:h-48 border-t border-[#2a2d30] bg-[#0c0d0e] p-4 flex flex-col md:flex-row gap-4 shrink-0 overflow-y-auto">
            <div className="flex-1 bg-[#151719] border border-[#2a2d30] p-3 rounded flex flex-col">
              {selectedCell ? (
                <>
                  <h3 className="text-[10px] font-mono uppercase text-[#cbd5e1] mb-2.5 font-bold pb-1 border-b border-[#2a2d30]">
                    Cell Inspection: {selectedCell.latStart}°N / {selectedCell.lonStart}°E
                  </h3>
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 flex-1">
                    <div>
                      <div className="text-[9px] text-[#9ca3af] uppercase font-semibold">Poisson Daily Prob.</div>
                      <div className="text-[12px] font-bold font-mono text-[#e0e2e4]">{(selectedCell.dailyPoissonProb * 100).toFixed(4)}%</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[#9ca3af] uppercase font-semibold">Poisson Daily 95% C.I.</div>
                      <div className="text-[11px] font-mono text-[#cbd5e1]">
                        [{(selectedCell.dailyPoissonProbLow * 100).toFixed(4)}% - {(selectedCell.dailyPoissonProbHigh * 100).toFixed(4)}%]
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[#9ca3af] uppercase font-semibold text-orange-500">Prob. by now</div>
                      <div className="text-[12px] font-bold font-mono text-[#ff4e00]">
                        {selectedCell.cumulativePoissonProb !== null ? (selectedCell.cumulativePoissonProb * 100).toFixed(2) + '%' : '--'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[#9ca3af] uppercase font-semibold text-orange-500">Prob. by now 95% C.I.</div>
                      <div className="text-[11px] font-mono text-[#ff4e00]/90">
                        {selectedCell.cumulativePoissonProbLow !== null && selectedCell.cumulativePoissonProbHigh !== null ? `[${(selectedCell.cumulativePoissonProbLow * 100).toFixed(2)}% - ${(selectedCell.cumulativePoissonProbHigh * 100).toFixed(2)}%]` : '--'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-[#9ca3af] uppercase font-semibold">Mean Return / Last Event</div>
                      <div className="text-[11px] font-mono text-[#e0e2e4]">
                        {selectedCell.meanReturnTimeDays.toFixed(0)}d / {selectedCell.daysSinceLastEvent !== null ? `${selectedCell.daysSinceLastEvent}d ago` : 'N/A'}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-[#9ca3af]">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#9ca3af]">No cell selected for inspection. Click on the map.</span>
                </div>
              )}
            </div>
            
            {selectedCell && selectedCell.recentEvents && selectedCell.recentEvents.length > 0 && (
              <div className="w-full md:w-72 lg:w-80 bg-[#151719] border border-[#2a2d30] p-3 rounded shrink-0 flex flex-col overflow-hidden">
                <h3 className="text-[10px] font-mono uppercase text-[#cbd5e1] mb-2 shrink-0 border-b border-[#2a2d30] pb-1 font-bold">Recent Cell Events</h3>
                <div className="overflow-y-auto space-y-2 pr-1 flex-1">
                  {selectedCell.recentEvents.map(eq => (
                    <div key={eq.id} className="bg-[#1c1f23] p-2 rounded flex flex-col gap-1 border border-[#2a2d30]">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] text-[#e0e2e4] font-medium truncate pr-2 uppercase" title={eq.place}>{eq.place}</span>
                        <span className="text-[10px] font-mono font-bold text-[#ff4e00] bg-[#3a1a0a] px-1 border border-red-900 rounded shrink-0">
                          M {eq.mag.toFixed(1)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[9px] text-[#9ca3af] font-mono">
                        <span>{format(new Date(eq.time), 'yy-MM-dd HH:mm')}</span>
                        <span>z: {eq.depth.toFixed(1)}km</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="w-full md:w-64 bg-[#151719] border border-[#2a2d30] p-3 rounded shrink-0">
              <h3 className="text-[10px] font-mono uppercase text-[#cbd5e1] mb-2 font-bold pb-1 border-b border-[#2a2d30]">Model Settings</h3>
              <div className="space-y-2 text-[10px] font-mono">
                <div className="flex justify-between">
                  <span className="text-[#9ca3af]">Time Window:</span>
                  <span className="text-[#e0e2e4]">1985–Now</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9ca3af]">Min Magnitude:</span>
                  <span className="text-[#e0e2e4]">4.0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9ca3af]">Auto-Refresh:</span>
                  <span className="text-[#44ff44]">ENABLED</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Bar */}
      <footer className="h-8 border-t border-[#2a2d30] bg-[#111315] flex flex-wrap items-center justify-between px-4 text-[9px] font-mono text-[#4b5563] shrink-0">
        <div className="flex gap-2 lg:gap-4 truncate">
          <span>DATA SOURCE: INGV SEISMIC CATALOG</span>
          <span className="hidden md:inline">|</span>
          <span className="hidden md:inline">ALGORITHM: POISSON STATIONARY MODEL</span>
        </div>
        <div className="flex gap-4 ml-auto">
          <span className="hidden sm:inline">SYSTEM TIME: {new Date().toISOString()}</span>
          <span className="text-[#44ff44]">STABLE</span>
        </div>
      </footer>
    </div>
  );
}
