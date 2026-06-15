import React, { useMemo, useState } from "react";
import { MapContainer, TileLayer, Rectangle, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { GridCellStats } from "../lib/earthquakeStats";
import { format } from "date-fns";

interface MapProps {
  grid: GridCellStats[];
  onCellClick: (cell: GridCellStats) => void;
}

// Map center for Italy
const center: [number, number] = [41.8719, 12.5674];

const getColor = (prob: number) => {
  // Color scale based on cumulative probability
  if (prob >= 0.90) return "#800026";
  if (prob >= 0.70) return "#BD0026";
  if (prob >= 0.50) return "#E31A1C";
  if (prob >= 0.30) return "#FC4E2A";
  if (prob >= 0.15) return "#FD8D3C";
  if (prob >= 0.05) return "#FEB24C";
  if (prob > 0) return "#FED976";
  return "transparent";
};

export default function EarthquakeMap({ grid, onCellClick }: MapProps) {
  return (
    <MapContainer 
      bounds={[
        [35, 6],
        [48, 19]
      ]}
      style={{ height: "100%", width: "100%", zIndex: 0 }}
      minZoom={4}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        subdomains="abcd"
        maxZoom={20}
      />
      {grid.map((cell, idx) => {
        if (cell.eventsCount === 0) return null; // No data to show
        
        const bounds: [[number, number], [number, number]] = [
          [cell.latStart, cell.lonStart],
          [cell.latEnd, cell.lonEnd],
        ];

        // We use Cumulative Poisson Model as primary color representation
        const color = getColor(cell.cumulativePoissonProb || 0);

        return (
          <Rectangle
            key={idx}
            bounds={bounds}
            pathOptions={{ 
              color: "#333", 
              weight: 1, 
              fillColor: color, 
              fillOpacity: 0.6 
            }}
            eventHandlers={{
              click: () => onCellClick(cell)
            }}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold mb-1">
                  Grid: {cell.latStart}°N to {cell.latEnd}°N, {cell.lonStart}°E to {cell.lonEnd}°E
                </div>
                <div className="flex justify-between border-b pb-1 mb-1">
                  <span className="text-gray-500">M≥4 Events:</span>
                  <span className="font-bold">{cell.eventsCount}</span>
                </div>
                <div className="flex justify-between border-b pb-1 mb-1 items-center">
                  <span className="text-gray-500">Poisson Prob (Daily):</span>
                  <span className="font-mono text-xs">{(cell.dailyPoissonProb * 100).toFixed(4)}%</span>
                </div>
                <div className="flex justify-between items-center text-gray-400 font-semibold mb-2">
                  <span>95% CI:</span>
                  <span className="font-mono text-xs">[{(cell.dailyPoissonProbLow * 100).toFixed(4)}% - {(cell.dailyPoissonProbHigh * 100).toFixed(4)}%]</span>
                </div>
                {cell.cumulativePoissonProb !== null && (
                  <>
                    <div className="flex justify-between items-center text-orange-700 font-semibold mb-1">
                      <span>Prob. by now:</span>
                      <span className="font-mono text-xs">{(cell.cumulativePoissonProb * 100).toFixed(2)}%</span>
                    </div>
                    {cell.cumulativePoissonProbLow !== null && cell.cumulativePoissonProbHigh !== null && (
                      <div className="flex justify-between items-center text-orange-500 font-semibold mb-2">
                        <span>95% CI:</span>
                        <span className="font-mono text-xs">[{(cell.cumulativePoissonProbLow * 100).toFixed(2)}% - {(cell.cumulativePoissonProbHigh * 100).toFixed(2)}%]</span>
                      </div>
                    )}
                  </>
                )}
                {cell.latestEventTime && (
                  <div className="text-xs text-gray-500">
                    Latest Event: {format(new Date(cell.latestEventTime), 'yyyy-MM-dd HH:mm')}
                  </div>
                )}
              </div>
            </Popup>
          </Rectangle>
        )
      })}
    </MapContainer>
  );
}
