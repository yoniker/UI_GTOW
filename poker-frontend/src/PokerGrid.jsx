import React, { useState, useEffect } from 'react';

// GTOWizard standard action colors
const ACTION_COLORS = {
  'R4': 'rgb(163, 41, 41)',   // Red (Raise)
  'X':  'rgb(90, 185, 102)',  // Green (Check)
  'C':  'rgb(90, 185, 102)',  // Green (Call)
  'F':  'rgb(61, 124, 184)'   // Blue (Fold)
};

const ACTION_ORDER = ['R4', 'X', 'C', 'F']; 

// 4-Color Deck configuration for the tooltip
const SUITS = {
  's': { symbol: '♠', color: '#aaaaaa' }, // Spade (Grey/White in dark mode)
  'h': { symbol: '♥', color: '#d34343' }, // Heart (Red)
  'd': { symbol: '♦', color: '#4592d8' }, // Diamond (Blue)
  'c': { symbol: '♣', color: '#5ab966' }  // Club (Green)
};

export default function PokerGrid() {
  const [gridData, setGridData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredCell, setHoveredCell] = useState(null);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/node/1/player/0')
      .then(res => res.json())
      .then(data => {
        setGridData(data.grid);
        setLoading(false);
      })
      .catch(err => console.error("Failed to fetch matrix:", err));
  }, []);

  // Main 13x13 Grid Background
  const getCellBackgroundStyle = (actions, totalWeight) => {
    if (totalWeight === 0 || !actions || Object.keys(actions).length === 0) {
      return { backgroundColor: '#1a1a1a', color: '#444' }; // Dead hand
    }

    let cumulativeWidth = 0;
    const gradients = [];
    const sizes = [];

    const availableActions = Object.entries(actions).sort((a, b) => 
      ACTION_ORDER.indexOf(a[0]) - ACTION_ORDER.indexOf(b[0])
    );

    availableActions.forEach(([actionCode, data]) => {
      if (data.strategy > 0) {
        cumulativeWidth += data.strategy;
        const color = ACTION_COLORS[actionCode] || '#888';
        gradients.push(`linear-gradient(to right, ${color}, ${color})`);
        sizes.push(`${cumulativeWidth}% 100%`);
      }
    });

    return {
      backgroundImage: gradients.join(', '),
      backgroundSize: sizes.join(', '),
      backgroundRepeat: 'no-repeat',
      backgroundColor: '#2b2b2b'
    };
  };

  // Helper to format the specific card strings (e.g., "As" -> Rank "A", Suit data)
  const renderCard = (cardStr) => {
    const rank = cardStr[0];
    const suit = SUITS[cardStr[1]];
    return (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
        <span style={{ color: suit.color }}>{rank}</span>
        <span style={{ color: suit.color, fontSize: '14px' }}>{suit.symbol}</span>
      </div>
    );
  };

  if (loading) {
    return <div style={{ color: 'white', padding: '20px', fontFamily: 'sans-serif' }}>Loading Matrix...</div>;
  }

  return (
    <div style={{ 
      backgroundColor: '#121212', minHeight: '100vh', display: 'flex', 
      alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', gap: '40px' 
    }}>
      
      {/* LEFT SIDE: The 13x13 Grid */}
      <div style={{ 
        display: 'grid', gridTemplateColumns: 'repeat(13, 1fr)', gap: '2px', 
        backgroundColor: '#222', padding: '2px', borderRadius: '6px',
        width: '600px', height: '600px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
      }}>
        {gridData.map((cell) => (
          <div 
            key={cell.cell_name}
            onMouseEnter={() => setHoveredCell(cell)}
            onMouseLeave={() => setHoveredCell(null)}
            style={{
              position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', fontWeight: 'bold', color: 'white', userSelect: 'none', cursor: 'pointer',
              ...getCellBackgroundStyle(cell.actions, cell.total_weight)
            }}
          >
            <span style={{ textShadow: '0 1px 2px rgba(0,0,0,0.9)', zIndex: 10, pointerEvents: 'none' }}>
              {cell.cell_name}
            </span>
          </div>
        ))}
      </div>

      {/* RIGHT SIDE: The GTOW Detailed Tooltip Panel */}
      <div style={{
        width: '380px', height: '600px', backgroundColor: '#1e1e1e', borderRadius: '6px',
        padding: '16px', color: '#ccc', border: '1px solid #333', overflowY: 'auto'
      }}>
        {hoveredCell ? (
          <>
            <div style={{ borderBottom: '1px solid #333', paddingBottom: '12px', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: 'white', margin: '0 0 4px 0' }}>{hoveredCell.cell_name}</h2>
              <div style={{ fontSize: '14px', display: 'flex', gap: '16px' }}>
                <span><strong>EQ:</strong> {hoveredCell.equity.toFixed(1)}%</span>
                <span><strong>Weight:</strong> {hoveredCell.total_weight.toFixed(2)}</span>
              </div>
            </div>
            
            {/* The Detailed Combos Grid */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: hoveredCell.combos.length > 6 ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', 
              gap: '8px' 
            }}>
              {hoveredCell.combos.map((combo, idx) => (
                <div key={idx} style={{ 
                  backgroundColor: '#2a2a2a', border: '1px solid #444', borderRadius: '4px', padding: '6px',
                  opacity: combo.weight === 0 ? 0.3 : 1 // Dim dead cards
                }}>
                  {/* Combo Header: Cards + EV */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontWeight: 'bold', fontSize: '13px' }}>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {renderCard(combo.cards.substring(0, 2))}
                      {renderCard(combo.cards.substring(2, 4))}
                    </div>
                    {combo.weight > 0 && (
                      <span style={{ color: '#aaa', fontSize: '11px' }}>
                        {/* Show highest EV for display purposes like GTOW */}
                        EV: {Math.max(...Object.values(combo.actions).map(a => a.ev)).toFixed(2)}
                      </span>
                    )}
                  </div>

                  {/* The Mini Strategy Bar Graph */}
                  {combo.weight > 0 ? (
                    <div style={{ width: '100%', height: '8px', display: 'flex', borderRadius: '2px', overflow: 'hidden' }}>
                      {ACTION_ORDER.map(actCode => {
                        const actData = combo.actions[actCode];
                        if (!actData || actData.strategy <= 0) return null;
                        return (
                          <div key={actCode} style={{ 
                            width: `${actData.strategy}%`, 
                            backgroundColor: ACTION_COLORS[actCode],
                            height: '100%'
                          }} />
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ width: '100%', height: '8px', backgroundColor: '#111', borderRadius: '2px' }}></div>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontStyle: 'italic' }}>
            Hover over a hand in the matrix to view the specific combo breakdown.
          </div>
        )}
      </div>

    </div>
  );
}