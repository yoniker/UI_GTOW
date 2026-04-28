import React, { useState, useEffect, useMemo } from 'react';
import { ACTION_COLORS, CATEGORIES, renderCard, formatActionName } from '../constants';

export default function RangeExplorer({ viewedNodeId, activePlayer }) {
  const [gridData, setGridData] = useState([]);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [lockedCell, setLockedCell] = useState(null);
  
  const [viewMode, setViewMode] = useState('Strategy');
  const [layoutMode, setLayoutMode] = useState('Grid'); 
  
  const [hoveredFilter, setHoveredFilter] = useState(null);
  const [lockedFilter, setLockedFilter] = useState(null);

  const activeFilter = lockedFilter || hoveredFilter;

  // 1. Reset local state when the user navigates to a new node or switches players
  useEffect(() => {
    setLockedCell(null);
    setHoveredCell(null);
    setLockedFilter(null);
    setHoveredFilter(null);
  }, [viewedNodeId, activePlayer]);

  // 2. Fetch the actual matrix data
  useEffect(() => {
    if (viewedNodeId) {
      fetch(`http://127.0.0.1:8000/api/node/${viewedNodeId}/player/${activePlayer}`)
        .then(res => res.json())
        .then(data => setGridData(data.grid || []))
        .catch(err => console.error("Grid Fetch Error:", err));
    }
  }, [viewedNodeId, activePlayer]);

  // 3. The Math Engine (Handles Filtering, Global Frequencies, and the Report Buckets)
  const { filteredData, globalFreqs, totalCombos, reportBuckets } = useMemo(() => {
    let tCombos = 0;
    const actSums = {};
    const buckets = {};
    
    Object.keys(CATEGORIES).forEach(t => { 
      buckets[t] = {}; 
      CATEGORIES[t].forEach(c => buckets[t][c] = { combos: 0, actions: {} });
    });

    const filtered = gridData.map(cell => {
      let newTotalWeight = 0;
      const newActions = {};

      const newCombos = cell.combos.map(combo => {
        const isMatch = !activeFilter || (combo.tags?.[activeFilter.type] === activeFilter.value);
        const weight = isMatch ? combo.weight : 0;
        
        if (weight > 0) {
          tCombos += weight;
          newTotalWeight += weight;
          Object.entries(combo.actions).forEach(([act, d]) => {
            // Safely handle both flat numbers and { strategy, ev } objects
            const strat = typeof d === 'number' ? d : (d.strategy || 0);
            actSums[act] = (actSums[act] || 0) + (strat / 100) * weight;
            newActions[act] = (newActions[act] || 0) + (strat / 100) * weight;
          });
        }

        // Populate Report Categories
        if (combo.weight > 0 && combo.tags) {
          Object.keys(buckets).forEach(type => {
            const val = combo.tags[type];
            if (buckets[type][val]) {
              buckets[type][val].combos += combo.weight;
              Object.entries(combo.actions).forEach(([act, d]) => {
                const strat = typeof d === 'number' ? d : (d.strategy || 0);
                buckets[type][val].actions[act] = (buckets[type][val].actions[act] || 0) + (strat / 100) * combo.weight;
              });
            }
          });
        }
        return { ...combo, weight };
      });

      // Recalculate cell percentages based on the active filter
      const normalizedActions = {};
      if (newTotalWeight > 0) {
        Object.keys(newActions).forEach(act => {
          normalizedActions[act] = { 
            strategy: (newActions[act] / newTotalWeight) * 100, 
            ev: cell.actions[act]?.ev || 0 
          };
        });
      }

      return { ...cell, combos: newCombos, total_weight: newTotalWeight, actions: normalizedActions };
    });

    return { filteredData: filtered, globalFreqs: actSums, totalCombos: tCombos, reportBuckets: buckets };
  }, [gridData, activeFilter]);

  const sortedActions = Object.keys(globalFreqs).sort((a, b) => ["R", "B", "X", "C", "F"].indexOf(a[0]) - ["R", "B", "X", "C", "F"].indexOf(b[0]));

  // 4. Bulletproof Gradient Generator
  const getBackgroundGraph = (actions, total) => {
    if (total === 0 || !actions || Object.keys(actions).length === 0) return { backgroundColor: '#222' };
    let cum = 0; const grads = [];
    const sorted = Object.entries(actions).sort((a,b) => ["R", "B", "X", "C", "F"].indexOf(a[0][0]) - ["R", "B", "X", "C", "F"].indexOf(b[0][0]));
    
    sorted.forEach(([act, val]) => {
      const pct = typeof val === 'object' ? val.strategy : (val / total) * 100;
      if (pct > 0) {
        grads.push(`${ACTION_COLORS[act[0]]} ${cum}% ${cum + pct}%`);
        cum += pct;
      }
    });
    return grads.length ? { backgroundImage: `linear-gradient(to right, ${grads.join(', ')})` } : { backgroundColor: '#222' };
  };

  const activeCell = lockedCell || hoveredCell;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px' }}>
      
      {/* --- TOP CONTROLS --- */}
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '1060px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setLayoutMode('Grid')} style={{ padding: '6px 16px', backgroundColor: layoutMode === 'Grid' ? '#444' : '#222', color: 'white', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer' }}>Grid View</button>
          <button onClick={() => setLayoutMode('Report')} style={{ padding: '6px 16px', backgroundColor: layoutMode === 'Report' ? '#444' : '#222', color: 'white', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer' }}>Report View</button>
        </div>
        <select value={viewMode} onChange={e => setViewMode(e.target.value)} style={{ backgroundColor: '#222', color: 'white', padding: '6px', border: '1px solid #555', borderRadius: '4px', outline: 'none' }}>
          <option value="Strategy">Strategy</option>
          <option value="EV">EV</option>
          <option value="Equity">Equity</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: '30px' }}>
        
        {/* --- LEFT PANEL: GRID OR REPORT --- */}
        <div style={{ width: '600px', height: '600px', backgroundColor: '#161616', borderRadius: '8px', overflowY: 'auto' }}>
          
          {layoutMode === 'Grid' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: '1px', padding: '1px' }}>
              {filteredData.map(cell => {
                const isDimmed = activeFilter && cell.total_weight === 0;
                const evs = Object.values(cell.actions).map(a => a.ev || 0);
                const maxEv = evs.length > 0 ? Math.max(...evs) : null;
                const displayValue = viewMode === 'Strategy' ? cell.cell_name : viewMode === 'EV' ? (maxEv !== null && maxEv > 0 ? maxEv.toFixed(2) : '') : `${(cell.equity||0).toFixed(1)}%`;

                return (
                  <div key={cell.cell_name} 
                    onMouseEnter={() => setHoveredCell(cell)} 
                    onMouseLeave={() => setHoveredCell(null)}
                    onClick={() => setLockedCell(lockedCell?.cell_name === cell.cell_name ? null : cell)}
                    style={{ 
                      height: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', color: 'white', cursor: 'pointer',
                      opacity: isDimmed ? 0.2 : 1, border: lockedCell?.cell_name === cell.cell_name ? '2px solid white' : 'none',
                      ...getBackgroundGraph(cell.actions, 100)
                    }}>
                    <span style={{ textShadow: '0 1px 2px black', zIndex: 2 }}>{displayValue}</span>
                    {viewMode !== 'Strategy' && <span style={{ position: 'absolute', top: '2px', left: '2px', fontSize: '9px', color: '#ccc', zIndex: 1 }}>{cell.cell_name}</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', padding: '15px' }}>
              {Object.keys(CATEGORIES).map(type => (
                <div key={type} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '10px', color: '#888', fontWeight: 'bold', textTransform: 'uppercase', borderBottom: '1px solid #333' }}>{type}</div>
                  {CATEGORIES[type].map(cat => {
                    const b = reportBuckets[type][cat];
                    if (!b || b.combos === 0) return null;
                    const isSelected = lockedFilter?.value === cat || hoveredFilter?.value === cat;
                    return (
                      <div key={cat} 
                        onMouseEnter={() => setHoveredFilter({type, value: cat})} 
                        onMouseLeave={() => setHoveredFilter(null)}
                        onClick={() => setLockedFilter(lockedFilter?.value === cat ? null : {type, value: cat})}
                        style={{ 
                          padding: '6px', borderRadius: '4px', cursor: 'pointer', border: isSelected ? '1px solid white' : '1px solid #333',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...getBackgroundGraph(b.actions, b.combos)
                        }}>
                        <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'white', textShadow: '0 1px 2px black' }}>{cat}</span>
                        <span style={{ fontSize: '9px', color: '#ccc', textShadow: '0 1px 2px black' }}>{((b.combos / gridData.reduce((s,c)=>s+c.total_weight,0))*100).toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* --- RIGHT PANEL: STATS & CELL BREAKDOWN --- */}
        <div style={{ width: '400px', backgroundColor: '#1e1e1e', borderRadius: '8px', padding: '16px', border: '1px solid #333', overflowY: 'auto' }}>
          
          <h4 style={{ color: '#888', marginBottom: '15px', textTransform: 'uppercase', fontSize: '12px' }}>
            {activeFilter ? `${activeFilter.value} Strategy` : "Global Strategy"}
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sortedActions.map(act => {
              const freq = totalCombos > 0 ? (globalFreqs[act] / totalCombos) * 100 : 0;
              return (
                <div key={act} style={{ position: 'relative', height: '50px', backgroundColor: '#111', borderRadius: '6px', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${freq}%`, backgroundColor: ACTION_COLORS[act[0]], opacity: 0.8 }} />
                  <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 15px', color: 'white' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', textShadow: '0 1px 2px black' }}>{formatActionName(act)}</span>
                      <span style={{ fontSize: '18px', fontWeight: '900', textShadow: '0 1px 2px black' }}>{freq.toFixed(1)}%</span>
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 'bold', textShadow: '0 1px 2px black' }}>{globalFreqs[act].toFixed(1)} <small style={{color: '#888'}}>combos</small></span>
                  </div>
                </div>
              );
            })}
          </div>
          
          {activeCell && (
            <div style={{ marginTop: '20px', borderTop: '1px solid #333', paddingTop: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ color: 'white', margin: 0 }}>{activeCell.cell_name} {lockedCell && <span style={{ fontSize: '14px' }}>🔒</span>}</h3>
                <div style={{ fontSize: '12px', color: '#aaa', display: 'flex', gap: '10px' }}>
                  <span>EQ: {(activeCell.equity||0).toFixed(1)}%</span>
                  <span>W: {activeCell.total_weight.toFixed(2)}</span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: activeCell.combos.length > 4 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: '6px' }}>
                {activeCell.combos.map((combo, i) => {
                  if (combo.weight === 0) return null;
                  const cSorted = Object.keys(combo.actions).sort((a, b) => ["R", "B", "X", "C", "F"].indexOf(a[0]) - ["R", "B", "X", "C", "F"].indexOf(b[0]));
                  return (
                    <div key={i} style={{ ...getBackgroundGraph(combo.actions, 100), padding: '6px', borderRadius: '4px', border: '1px solid #444' }}>
                      <div style={{ display: 'flex', gap: '2px', marginBottom: '4px' }}>
                        {renderCard(combo.cards.substring(0,2), "10px")}
                        {renderCard(combo.cards.substring(2,4), "10px")}
                      </div>
                      {viewMode === 'Strategy' && cSorted.map(act => {
                        const strat = typeof combo.actions[act] === 'number' ? combo.actions[act] : (combo.actions[act].strategy || 0);
                        if (strat <= 0) return null;
                        return (
                          <div key={act} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'white', textShadow: '0 1px 1px black' }}>
                            <span>{act === 'X' ? 'Check' : act}</span>
                            <span>{strat.toFixed(1)}%</span>
                          </div>
                        )
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}