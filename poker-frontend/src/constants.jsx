import React from 'react';

// ============================================================================
// 1. VISUAL CONSTANTS & HELPERS
// ============================================================================
export const ACTION_COLORS = { 'R': '#a32929', 'B': '#a32929', 'X': '#5ab966', 'C': '#5ab966', 'F': '#3d7cb8' };
export const SUITS = { 's': { symbol: '♠', color: '#000000' }, 'h': { symbol: '♥', color: '#d34343' }, 'd': { symbol: '♦', color: '#4592d8' }, 'c': { symbol: '♣', color: '#5ab966' } };

export const CATEGORIES = {
  made: ['Straight flush', 'Quads', 'Full house', 'Flush', 'Straight', 'Set', 'Two pair', 'Overpair', 'Top pair', 'Underpair', 'Second pair', 'Third pair', 'Low pair', 'Ace high', 'King high', 'Nothing'],
  draw: ['Straight flush draw', 'Combo draw', 'Flush draw nuts', 'Flush draw', 'OESD', 'Gutshot', 'Twocard bdfd', 'Onecard bdfd', 'No draw'],
  strength: ['Best hands', 'Good hands', 'Weak hands', 'Trash hands'],
  equity: ['90-100%', '80-90%', '70-80%', '60-70%', '50-60%', '25-50%', '0-25%']
};

export const renderCard = (cardStr, size = "14px") => {
  if (!cardStr || cardStr.length < 2) return null;
  const suit = SUITS[cardStr[1]];
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: '3px', padding: '2px 4px', boxShadow: '0 1px 2px rgba(0,0,0,0.5)', minWidth: '18px' }}>
      <span style={{ color: suit?.color, fontSize: size, fontWeight: 'bold', lineHeight: 1 }}>{cardStr[0]}</span>
      <span style={{ color: suit?.color, fontSize: size, lineHeight: 1 }}>{suit?.symbol}</span>
    </div>
  );
};

// THIS IS THE FUNCTION VITE WAS MISSING!
export const formatActionName = (actCode) => {
  if (actCode === 'X') return 'Check';
  if (actCode === 'C') return 'Call';
  if (actCode === 'F') return 'Fold';
  if (actCode.startsWith('R') || actCode.startsWith('B')) return `Bet ${actCode.substring(1)}`;
  return actCode;
};

// ============================================================================
// 2. THE SEMANTIC ENGINE (Strict Taxonomy Generator)
// ============================================================================
export const processLineage = (rawLineage) => {
  console.log("⚙️ [ENGINE] Raw Lineage Received:", rawLineage);
  if (!rawLineage || rawLineage.length === 0) return { processedTimeline: [], playerOOP: 'P0', playerIP: 'P1' };

  let playerOOP = 'OOP';
  let playerIP = 'IP';
  
  // Clean strings just in case
  const cleanedLineage = rawLineage.map(s => ({ ...s, player: s.player ? s.player.trim() : null }));
  const allPlayers = [...new Set(cleanedLineage.filter(s => s.type !== 'board' && s.player).map(s => s.player))];

  const firstPostFlopAction = cleanedLineage.find(s => s.type !== 'board' && s.street !== 'Preflop' && s.player);

  if (firstPostFlopAction) {
    playerOOP = firstPostFlopAction.player;
    playerIP = allPlayers.find(p => p !== playerOOP) || 'IP';
  } else if (allPlayers.length > 1) {
    playerIP = allPlayers[0];
    playerOOP = allPlayers[1];
  }

  console.log(`⚙️ [ENGINE] Players Resolved -> OOP (0): [${playerOOP}] | IP (1): [${playerIP}]`);

  const actionCounters = {};

  const processedTimeline = cleanedLineage.map((step, index) => {
    const street = step.street || 'Unknown Street'; 
    if (!actionCounters[street]) actionCounters[street] = { OOP: 0, IP: 0 };

    let semantic_id = '';
    let player_index = 0; 

    if (step.type === 'board') {
      semantic_id = `${street}_Board`;
      player_index = 0; 
    } 
    else if (step.type === 'action' || step.type === 'active_node') {
      player_index = step.player === playerIP ? 1 : 0;
      const playerKey = player_index === 0 ? 'OOP' : 'IP';
      actionCounters[street][playerKey] += 1;
      semantic_id = `${street}_Player${player_index}_Action${actionCounters[street][playerKey]}`;
    } 

    console.log(`⚙️ [ENGINE] Tagged Node [${step.node_id}] -> ${semantic_id} (PlayerIndex: ${player_index})`);

    return { ...step, semantic_id, player_index, street };
  });

  return { processedTimeline, playerOOP, playerIP };
};