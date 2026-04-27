import React, { useState, useEffect } from 'react';

// --- SHARED CONSTANTS & HELPERS ---
const ACTION_COLORS = { 'R': '#a32929', 'B': '#a32929', 'X': '#5ab966', 'C': '#5ab966', 'F': '#3d7cb8' };
const SUITS = { 's': { symbol: '♠', color: '#000000' }, 'h': { symbol: '♥', color: '#d34343' }, 'd': { symbol: '♦', color: '#4592d8' }, 'c': { symbol: '♣', color: '#5ab966' } };

const renderCard = (cardStr, size = "14px") => {
  if (!cardStr || cardStr.length < 2) return null;
  const suit = SUITS[cardStr[1]];
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: '3px', padding: '2px 4px', boxShadow: '0 1px 2px rgba(0,0,0,0.5)', minWidth: '18px' }}>
      <span style={{ color: suit?.color, fontSize: size, fontWeight: 'bold', lineHeight: 1 }}>{cardStr[0]}</span>
      <span style={{ color: suit?.color, fontSize: size, lineHeight: 1 }}>{suit?.symbol}</span>
    </div>
  );
};

// --- COMPONENT 1: THE TIMELINE ---
function SpotNavigator({ anchorNodeId, setAnchorNodeId, viewedNodeId, setViewedNodeId, lineage }) {
  const [navData, setNavData] = useState({ worlds: [], strategy_locks: [], children: [] });

  useEffect(() => {
    fetch(`http://127.0.0.1:8000/api/navigation/${viewedNodeId}`)
      .then(res => res.json())
      .then(data => setNavData(data))
      .catch(err => console.error("Failed to fetch navigation:", err));
  }, [viewedNodeId]);

  return (
    <div style={{ display: 'flex', gap: '8px', padding: '12px', backgroundColor: '#161616', overflowX: 'auto', borderBottom: '1px solid #333' }}>
      {lineage.map((step, idx) => {
        const isCardViewed = step.node_id === viewedNodeId;

        return (
          <div key={idx} onClick={() => !isCardViewed && step.node_id && setViewedNodeId(step.node_id)}
            style={{
              minWidth: '180px', backgroundColor: isCardViewed ? '#2a2a2a' : '#1e1e1e', 
              border: isCardViewed ? '1px solid #888' : '1px solid #333',
              borderRadius: '6px', padding: '10px', color: '#ccc', display: 'flex', flexDirection: 'column',
              cursor: isCardViewed ? 'default' : 'pointer', transition: 'all 0.2s', opacity: isCardViewed ? 1 : 0.6 
            }}>
            
            {/* Header */}
            <div style={{ borderBottom: '1px solid #333', paddingBottom: '4px', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px', textTransform: 'uppercase', fontWeight: 'bold', color: isCardViewed ? 'white' : '#aaa' }}>
                {step.type === 'board' ? step.street : step.player}
              </span>
            </div>

            {/* Content Body */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
              
              {/* Board Cards */}
              {step.type === 'board' && (
                <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                  {step.cards.match(/.{1,2}/g)?.map((c, i) => <React.Fragment key={i}>{renderCard(c, "16px")}</React.Fragment>)}
                </div>
              )}

              {/* Inactive Card: Just show the action taken */}
              {!isCardViewed && step.type === 'action' && (
                <div style={{ alignSelf: 'center', backgroundColor: ACTION_COLORS[step.action[0]] || '#444', color: 'white', padding: '4px 12px', borderRadius: '4px', fontSize: '14px', fontWeight: 'bold' }}>
                  {step.action === 'X' ? 'Check' : step.action === 'C' ? 'Call' : step.action}
                </div>
              )}

              {/* Active Card logic */}
              {isCardViewed && step.type !== 'board' && (
                <>
                  {/* SEPARATE RECTANGLE 1: Structural Worlds (Only shows if there are multiple bet sizing trees) */}
                  {navData.worlds && navData.worlds.length > 1 && (
                    <div style={{ backgroundColor: '#1a1a1a', padding: '8px', borderRadius: '4px', border: '1px solid #444', marginBottom: '4px' }}>
                      <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px', textTransform: 'uppercase' }}>Structural World:</div>
                      <select 
                        onChange={(e) => { const id = Number(e.target.value); setAnchorNodeId(id); setViewedNodeId(id); }}
                        value={viewedNodeId}
                        style={{ width: '100%', backgroundColor: '#111', color: '#fff', border: '1px solid #555', borderRadius: '4px', fontSize: '11px', padding: '4px', cursor: 'pointer' }}
                      >
                        {navData.worlds.map(w => <option key={w.node_id} value={w.node_id}>{w.name}</option>)}
                      </select>
                    </div>
                  )}

                  {/* SEPARATE RECTANGLE 2: Strategy Locks (Only shows at the exact node a lock was applied) */}
                  {navData.strategy_locks && navData.strategy_locks.length > 0 && (
                    <div style={{ backgroundColor: '#1a1a1a', padding: '8px', borderRadius: '4px', border: '1px dashed #666', marginBottom: '4px' }}>
                      <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px', textTransform: 'uppercase' }}>Strategy Lock:</div>
                      <select 
                        onChange={(e) => { const id = Number(e.target.value); setAnchorNodeId(id); setViewedNodeId(id); }}
                        value={viewedNodeId}
                        style={{ width: '100%', backgroundColor: '#111', color: '#fff', border: '1px solid #555', borderRadius: '4px', fontSize: '11px', padding: '4px', cursor: 'pointer' }}
                      >
                        {navData.strategy_locks.map(l => <option key={l.node_id} value={l.node_id}>{l.name}</option>)}
                      </select>
                    </div>
                  )}

                  {/* Action Buttons (Strictly filtered to the selected World) */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {navData.children && navData.children.map(child => {
                      const isHistoricallyTaken = step.type === 'action' && step.action === child.action;
                      return (
                        <button 
                          key={child.action}
                          onClick={(e) => { e.stopPropagation(); if (child.node_id) { setAnchorNodeId(child.node_id); setViewedNodeId(child.node_id); } }}
                          style={{
                            backgroundColor: ACTION_COLORS[child.action[0]] || '#444', color: 'white', border: isHistoricallyTaken ? '2px solid #fff' : '2px solid transparent',
                            padding: '6px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: child.node_id ? 'pointer' : 'not-allowed',
                            opacity: child.node_id ? 1 : 0.4, boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                          }}
                        >
                          {child.action === 'X' ? 'Check' : child.action === 'C' ? 'Call' : child.action}
                        </button>
                      );
                    })}
                    {(!navData.children || navData.children.length === 0) && <span style={{ fontSize: '12px', fontStyle: 'italic', color: '#888' }}>End of Route</span>}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// --- COMPONENT 2: THE 13x13 GRID & TOOLTIP ---
function PokerGrid({ viewedNodeId, activePlayer }) {
  const [gridData, setGridData] = useState([]);
  const [hoveredCell, setHoveredCell] = useState(null);

  useEffect(() => {
    fetch(`http://127.0.0.1:8000/api/node/${viewedNodeId}/player/${activePlayer}`)
      .then(res => res.json())
      .then(data => setGridData(data.grid || []))
      .catch(err => console.error("Failed to fetch matrix:", err));
  }, [viewedNodeId, activePlayer]);

  const getCellBackground = (actions, weight) => {
    if (weight === 0 || !actions || Object.keys(actions).length === 0) return { backgroundColor: '#111', color: '#444' };
    let cumWidth = 0; const grads = [], sizes = [];
    const sortedActs = Object.entries(actions).sort((a, b) => ["R", "B", "X", "C", "F"].indexOf(a[0][0]) - ["R", "B", "X", "C", "F"].indexOf(b[0][0]));
    sortedActs.forEach(([act, d]) => {
      if (d.strategy > 0) {
        cumWidth += d.strategy; const col = ACTION_COLORS[act[0]] || '#888';
        grads.push(`linear-gradient(to right, ${col}, ${col})`); sizes.push(`${cumWidth}% 100%`);
      }
    });
    return { backgroundImage: grads.join(','), backgroundSize: sizes.join(','), backgroundRepeat: 'no-repeat', backgroundColor: '#222' };
  };

  return (
    <div style={{ display: 'flex', padding: '20px', gap: '40px', justifyContent: 'center' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: '2px', backgroundColor: '#222', padding: '2px', borderRadius: '6px', width: '600px', height: '600px' }}>
        {gridData.map(cell => (
          <div key={cell.cell_name} onMouseEnter={() => setHoveredCell(cell)} onMouseLeave={() => setHoveredCell(null)}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 'bold', color: 'white', cursor: 'pointer', ...getCellBackground(cell.actions, cell.total_weight) }}>
            <span style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)', zIndex: 10, pointerEvents: 'none' }}>{cell.cell_name}</span>
          </div>
        ))}
      </div>

      <div style={{ width: '380px', height: '600px', backgroundColor: '#1e1e1e', borderRadius: '6px', padding: '16px', border: '1px solid #333', overflowY: 'auto' }}>
        {hoveredCell ? (
          <>
            <div style={{ borderBottom: '1px solid #333', paddingBottom: '12px', marginBottom: '16px', color: 'white' }}>
              <h2 style={{ margin: '0 0 4px 0' }}>{hoveredCell.cell_name}</h2>
              <div style={{ fontSize: '14px', display: 'flex', gap: '16px', color: '#ccc' }}>
                <span><strong>EQ:</strong> {hoveredCell.equity.toFixed(1)}%</span>
                <span><strong>Weight:</strong> {hoveredCell.total_weight.toFixed(2)}</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: hoveredCell.combos.length > 6 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', gap: '8px' }}>
              {hoveredCell.combos.map((combo, idx) => (
                <div key={idx} style={{ backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', padding: '6px', opacity: combo.weight === 0 ? 0.3 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', gap: '2px' }}>
                      {renderCard(combo.cards.substring(0, 2), "12px")}
                      {renderCard(combo.cards.substring(2, 4), "12px")}
                    </div>
                    {combo.weight > 0 && <span style={{ color: '#aaa', fontSize: '11px', fontWeight: 'bold' }}>EV {Math.max(...Object.values(combo.actions).map(a => a.ev)).toFixed(2)}</span>}
                  </div>
                  {combo.weight > 0 ? (
                    <div style={{ width: '100%', height: '8px', display: 'flex', borderRadius: '2px', overflow: 'hidden' }}>
                      {Object.keys(combo.actions).sort((a, b) => ["R", "B", "X", "C", "F"].indexOf(a[0]) - ["R", "B", "X", "C", "F"].indexOf(b[0])).map(act => (
                        combo.actions[act]?.strategy > 0 && <div key={act} style={{ width: `${combo.actions[act].strategy}%`, backgroundColor: ACTION_COLORS[act[0]] || '#888' }} />
                      ))}
                    </div>
                  ) : <div style={{ width: '100%', height: '8px', backgroundColor: '#111', borderRadius: '2px' }} />}
                </div>
              ))}
            </div>
          </>
        ) : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>Hover over a hand.</div>}
      </div>
    </div>
  );
}

// --- MAIN APP ---
export default function App() {
  const [anchorNodeId, setAnchorNodeId] = useState(1); 
  const [viewedNodeId, setViewedNodeId] = useState(1);
  const [lineage, setLineage] = useState([]);

  useEffect(() => {
    fetch(`http://127.0.0.1:8000/api/lineage/${anchorNodeId}`)
      .then(res => res.json())
      .then(data => setLineage(data.timeline || []))
      .catch(err => console.error("Failed to fetch lineage:", err));
  }, [anchorNodeId]);

  const viewedStep = lineage.find(s => s.node_id === viewedNodeId);
  const activePlayer = viewedStep?.player === 'BTN' ? 1 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#121212' }}>
      <SpotNavigator 
        anchorNodeId={anchorNodeId} setAnchorNodeId={setAnchorNodeId}
        viewedNodeId={viewedNodeId} setViewedNodeId={setViewedNodeId}
        lineage={lineage}
      />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <PokerGrid viewedNodeId={viewedNodeId} activePlayer={activePlayer} />
      </div>
    </div>
  );
}