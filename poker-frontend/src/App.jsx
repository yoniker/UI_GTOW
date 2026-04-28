import React, { useState, useEffect, useMemo } from 'react';
import SpotNavigator from './components/SpotNavigator';
import RangeExplorer from './components/RangeExplorer';
import { processLineage } from './constants';

export default function App() {
  const [anchorNodeId, setAnchorNodeId] = useState(1);
  const [lineage, setLineage] = useState([]);
  const [viewedSemanticId, setViewedSemanticId] = useState(null);

  useEffect(() => {
    fetch(`http://127.0.0.1:8000/api/lineage/${anchorNodeId}`)
      .then(res => res.json())
      .then(data => {
        const fetchedLineage = data.timeline || [];
        setLineage(fetchedLineage);
        const { processedTimeline } = processLineage(fetchedLineage);
        if (processedTimeline.length > 0) {
          setViewedSemanticId(processedTimeline[processedTimeline.length - 1].semantic_id);
        }
      })
      .catch(err => console.error("Failed to fetch lineage:", err));
  }, [anchorNodeId]);

  const { processedTimeline, playerOOP, playerIP } = useMemo(() => {
    return processLineage(lineage);
  }, [lineage]);

  const activeStep = useMemo(() => {
    return processedTimeline.find(s => s.semantic_id === viewedSemanticId) || processedTimeline[processedTimeline.length - 1] || {};
  }, [processedTimeline, viewedSemanticId]);

  const viewedNodeId = activeStep.node_id || 1;
  // Fallback to 0 (OOP) only if player_index is completely undefined
  const activePlayerIndex = activeStep.player_index !== undefined ? activeStep.player_index : 0; 

  // 🔥 THE TRAP: Logs exactly what the Range Explorer is about to pull
  useEffect(() => {
    console.log(`\n📊 [RANGE EXPLORER DISPATCH]`);
    console.log(`   ▶ Target DB Node ID: ${viewedNodeId}`);
    console.log(`   ▶ Assigned Player Index: ${activePlayerIndex} (${activePlayerIndex === 0 ? 'OOP' : 'IP'})`);
    console.log(`   ▶ API Call: /api/node/${viewedNodeId}/player/${activePlayerIndex}\n`);
  }, [viewedNodeId, activePlayerIndex]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#121212', fontFamily: 'Inter, sans-serif' }}>
      
      <SpotNavigator 
        processedTimeline={processedTimeline}
        playerOOP={playerOOP}
        playerIP={playerIP}
        viewedSemanticId={viewedSemanticId}
        onViewSelect={setViewedSemanticId}
        onMutateTree={setAnchorNodeId}
      />
      
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {processedTimeline.length > 0 && (
          <RangeExplorer 
            viewedNodeId={viewedNodeId} 
            activePlayer={activePlayerIndex} 
          />
        )}
      </div>
      
    </div>
  );
}