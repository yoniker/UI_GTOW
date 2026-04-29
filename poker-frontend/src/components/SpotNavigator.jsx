import React, { useState, useEffect } from 'react';
import { ACTION_COLORS, renderCard } from '../constants';

export default function SpotNavigator({ processedTimeline, playerOOP, playerIP, viewedSemanticId, onViewSelect, onMutateTree }) {
  const [navData, setNavData] = useState({ worlds: [], strategy_locks: [], children: [] });

  const viewedIndex = processedTimeline.findIndex(s => s.semantic_id === viewedSemanticId);
  const safeViewedIndex = viewedIndex >= 0 ? viewedIndex : processedTimeline.length - 1;
  const viewedStep = processedTimeline[safeViewedIndex];
  const activeNodeId = viewedStep?.node_id;

  useEffect(() => {
    if (activeNodeId) {
      fetch(`http://127.0.0.1:8000/api/navigation/${activeNodeId}`)
        .then(res => res.json())
        .then(data => setNavData(data))
        .catch(err => console.error("Navigation Error:", err));
    }
  }, [activeNodeId]);

  const handleNodeClick = (step) => {
    onViewSelect(step.semantic_id);
  };

  const formatMetaText = (text) => {
    if (!text) return "";
    if (text.startsWith('World: ') && text.length > 15) return `${text.substring(0, 14)}...`;
    return text;
  };

  const safeWorldValue = navData.worlds?.some(w => w.node_id === activeNodeId) 
    ? activeNodeId 
    : (navData.worlds?.[0]?.node_id || '');

  const safeLockValue = navData.strategy_locks?.some(l => l.node_id === activeNodeId) 
    ? activeNodeId 
    : (navData.strategy_locks?.[0]?.node_id || '');

  return (
    <div style={{ display: 'flex', gap: '8px', padding: '16px', backgroundColor: '#121212', overflowX: 'auto', borderBottom: '1px solid #2a2a2a', minHeight: '160px', alignItems: 'center' }}>
      
      <div style={{ minWidth: '140px', backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff', borderBottom: '1px solid #333', paddingBottom: '6px' }}>
          {playerOOP} <span style={{ color: '#666', fontWeight: 'normal' }}>vs</span> {playerIP}
        </div>
        <div style={{ fontSize: '11px', color: '#888', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span>Stack: 98bb</span><span>Pot: 4.5bb</span>
        </div>
      </div>

      {processedTimeline.map((step, idx) => {
        const isViewed = idx === safeViewedIndex;
        const isFuture = idx > safeViewedIndex; 
        const hasAction = !!step.action;

        return (
          <React.Fragment key={step.semantic_id}>
            
            {step.type === 'board' && (
              <div onClick={() => handleNodeClick(step)}
                style={{
                  minWidth: '140px', display: 'flex', flexDirection: 'column',
                  backgroundColor: isViewed ? '#222' : '#161616', 
                  border: isViewed ? '2px solid #5ab966' : '1px solid #333',
                  borderRadius: '8px', padding: '12px', cursor: 'pointer', opacity: isFuture ? 0.3 : 1
                }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold', color: isViewed ? '#5ab966' : '#888', marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
                  {step.street}
                </div>
                <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                  {step.cards.match(/.{1,2}/g)?.map((c, i) => <React.Fragment key={i}>{renderCard(c, "16px")}</React.Fragment>)}
                </div>
              </div>
            )}

            {step.type === 'meta' && processedTimeline[idx + 1]?.semantic_id !== viewedSemanticId && (
              <div onClick={() => handleNodeClick(step)}
                style={{ 
                  minWidth: isViewed ? '160px' : '140px', 
                  backgroundColor: isViewed ? '#2a1b3d' : '#1a1423', 
                  border: '1px solid #6b4c9a', borderRadius: '8px', padding: '12px', 
                  cursor: 'pointer', opacity: isFuture ? 0.3 : 1, transition: 'all 0.2s ease'
                }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold', color: '#a78bfa', marginBottom: '8px', borderBottom: '1px solid #3b2a59', paddingBottom: '4px' }}>
                  ⛙ Structural Choice
                </div>
                
                {isViewed ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {navData.worlds?.length > 1 && step.action.startsWith('World') && (
                      <select onChange={(e) => onMutateTree(Number(e.target.value))} value={safeWorldValue} style={{ width: '100%', backgroundColor: '#111', color: '#fff', border: '1px solid #555', borderRadius: '4px', fontSize: '11px', padding: '6px', cursor: 'pointer', outline: 'none' }}>
                        {navData.worlds.map(w => <option key={w.node_id} value={w.node_id}>{w.name}</option>)}
                      </select>
                    )}
                    {navData.strategy_locks?.length > 0 && step.action.includes('Nodelock') && (
                      <select onChange={(e) => onMutateTree(Number(e.target.value))} value={safeLockValue} style={{ width: '100%', backgroundColor: '#111', color: '#fff', border: '1px solid #555', borderRadius: '4px', fontSize: '11px', padding: '6px', cursor: 'pointer', outline: 'none' }}>
                        {navData.strategy_locks.map(l => <option key={l.node_id} value={l.node_id}>{l.name}</option>)}
                      </select>
                    )}
                  </div>
                ) : (
                  <div style={{ color: 'white', fontSize: '12px', fontWeight: 'bold', textAlign: 'center' }}>
                    {formatMetaText(step.action)}
                  </div>
                )}
              </div>
            )}

            {(step.type === 'action' || step.type === 'active_node') && !isViewed && (hasAction || step.type === 'active_node') && (
              <div onClick={() => handleNodeClick(step)}
                style={{
                  minWidth: '140px', display: 'flex', flexDirection: 'column',
                  backgroundColor: '#161616', border: '1px solid #333',
                  borderRadius: '8px', padding: '12px', cursor: 'pointer', opacity: isFuture ? 0.3 : 1
                }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold', color: '#666', marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
                  {step.has_lock ? `Locked - ${step.player}` : `Action - ${step.player}`}
                </div>
                
                {step.action ? (
                  <div style={{ alignSelf: 'center', backgroundColor: ACTION_COLORS[step.action[0]] || '#444', color: 'white', padding: '4px 12px', borderRadius: '4px', fontSize: '13px', fontWeight: 'bold' }}>
                    {step.action === 'X' ? 'Check' : step.action === 'C' ? 'Call' : step.action}
                  </div>
                ) : (
                  <div style={{ alignSelf: 'center', backgroundColor: step.has_lock ? '#4a3a6e' : '#333', color: 'white', padding: '4px 12px', borderRadius: '4px', fontSize: '12px', fontStyle: 'italic' }}>
                    {step.has_lock ? 'Locked 🔒' : 'Pending...'}
                  </div>
                )}
              </div>
            )}

            {(step.type === 'action' || step.type === 'active_node') && isViewed && (
              <div style={{ display: 'flex', gap: '8px', marginLeft: hasAction ? '4px' : '0' }}>
                
                {navData.worlds?.length > 1 && (
                  <div style={{ minWidth: '160px', display: 'flex', flexDirection: 'column', backgroundColor: '#1a1423', border: '2px solid #6b4c9a', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold', color: '#a78bfa', marginBottom: '8px', borderBottom: '1px solid #3b2a59', paddingBottom: '4px' }}>
                      ⛙ Select World
                    </div>
                    <select onChange={(e) => onMutateTree(Number(e.target.value))} value={safeWorldValue} style={{ width: '100%', backgroundColor: '#111', color: '#fff', border: '1px solid #555', borderRadius: '4px', fontSize: '12px', padding: '6px', cursor: 'pointer' }}>
                      {navData.worlds.map(w => <option key={w.node_id} value={w.node_id}>{w.name}</option>)}
                    </select>
                  </div>
                )}

                {navData.strategy_locks?.length > 0 && (
                  <div style={{ minWidth: '160px', display: 'flex', flexDirection: 'column', backgroundColor: '#1a1a1a', border: '2px dashed #888', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold', color: '#888', marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
                      🔒 Select Nodelock
                    </div>
                    <select onChange={(e) => onMutateTree(Number(e.target.value))} value={safeLockValue} style={{ width: '100%', backgroundColor: '#111', color: '#fff', border: '1px solid #555', borderRadius: '4px', fontSize: '12px', padding: '6px', cursor: 'pointer' }}>
                      {navData.strategy_locks.map(l => <option key={l.node_id} value={l.node_id}>{l.name}</option>)}
                    </select>
                  </div>
                )}

                <div onClick={() => handleNodeClick(step)} style={{ minWidth: '160px', display: 'flex', flexDirection: 'column', backgroundColor: '#222', border: '2px solid #5ab966', borderRadius: '8px', padding: '12px', cursor: 'pointer' }}>
                  <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 'bold', color: '#5ab966', marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
                    Action - {step.player}
                  </div>
                  
                  {navData.children?.length > 0 ? (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      
                      {/* 🔥 THE GREY OUT FIX: Properly disables and greys out missing DB actions */}
                      {navData.children.map(child => {
                        const hasNode = !!child.node_id;
                        return (
                          <button 
                            key={child.action} 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              if (hasNode) {
                                onMutateTree(child.node_id); 
                              } else {
                                console.log(`❌ [DEAD END] Action ${child.action} is not saved in your database.`);
                              }
                            }} 
                            style={{ 
                              backgroundColor: ACTION_COLORS[child.action[0]] || '#444', 
                              color: 'white', 
                              border: 'none', 
                              padding: '6px 10px', 
                              borderRadius: '4px', 
                              fontSize: '12px', 
                              fontWeight: 'bold', 
                              cursor: hasNode ? 'pointer' : 'not-allowed',
                              opacity: hasNode ? 1 : 0.4
                            }}
                            title={hasNode ? '' : 'Node not saved in database'}
                          >
                            {child.action === 'X' ? 'Check' : child.action === 'C' ? 'Call' : child.action}
                          </button>
                        );
                      })}

                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', color: '#aaa', fontSize: '12px', fontStyle: 'italic' }}>
                      {step.action ? 'Action Locked' : 'End of Line'}
                    </div>
                  )}
                </div>

              </div>
            )}

          </React.Fragment>
        );
      })}
    </div>
  );
}