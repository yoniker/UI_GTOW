from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import sqlite3
import zlib
import json
import os

from poker_evaluator import categorize_combo

app = FastAPI(title="GTO Wizard Local Bridge")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'poker_database.sqlite')

RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
SUITS = ['c', 'd', 'h', 's']
DECK = [r + s for r in RANKS for s in SUITS]

def get_combo_from_idx(idx):
    for c1 in range(1, 52):
        base = (c1 * (c1 - 1)) // 2
        max_idx = base + (c1 - 1)
        if idx <= max_idx:
            c2 = idx - base
            return DECK[c1], DECK[c2]
    return None, None

def get_grid_key(card1, card2):
    r1, s1, r2, s2 = card1[0], card1[1], card2[0], card2[1]
    if RANKS.index(r1) < RANKS.index(r2): r1, r2, s1, s2 = r2, r1, s2, s1
    return r1 + r2 if r1 == r2 else r1 + r2 + 's' if s1 == s2 else r1 + r2 + 'o'

def get_active_player_idx(route):
    if not route or route == "Base_Node": return 0
    p = 0
    for act in route.split('-'):
        if act == 'C' or (act == 'X' and p == 1): p = 0
        else: p = 1 - p
    return p

# ==============================================================================
# 1. THE RELATIONAL LINEAGE TRACER (The Fix)
# ==============================================================================
@app.get("/api/lineage/{node_id}")
def get_node_lineage(node_id: int):
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # 1. Fetch Target
        cursor.execute("SELECT board, postflop_route, tree_id, has_direct_lock FROM Nodes WHERE node_id = ?", (node_id,))
        target = cursor.fetchone()
        if not target: return {"timeline": []}

        # 2. Build Ancestry Chain (Walk backwards up GameTrees)
        ancestry = []
        current_tid = target['tree_id']
        while current_tid:
            ancestry.insert(0, current_tid) # Insert at front to order chronologically
            if current_tid == 'base': break
            cursor.execute("SELECT parent_tree_id FROM GameTrees WHERE tree_id=?", (current_tid,))
            parent = cursor.fetchone()
            current_tid = parent['parent_tree_id'] if parent and parent['parent_tree_id'] else 'base'

        # Helper: Find the deepest valid node in our ancestry for a given route/board
        def get_historical_node(board, route):
            for tid in reversed(ancestry): # Start from deepest target tree, walk backwards to base
                cursor.execute("SELECT node_id, tree_id, has_direct_lock FROM Nodes WHERE board=? AND postflop_route=? AND tree_id=?", (board, route, tid))
                row = cursor.fetchone()
                if row: return dict(row)
            return None

        # 3. Chronological Reconstruction
        timeline = []
        streets = ["flop", "turn", "river"]
        current_street_idx = 0
        current_board = target['board'][:6]
        route_so_far = "Base_Node"
        current_player = "BB"
        last_used_tree = None

        # Handle Flop Entry (Base Node)
        base_node = get_historical_node(current_board, route_so_far)
        if base_node:
            last_used_tree = base_node['tree_id']
            timeline.append({"type": "board", "street": streets[current_street_idx], "cards": current_board, "node_id": base_node['node_id']})

        # Step through actions
        actions = target['postflop_route'].split('-') if target['postflop_route'] and target['postflop_route'] != "Base_Node" else []
        
        for act in actions:
            decision_node = get_historical_node(current_board, route_so_far)

            if decision_node:
                # TRAP: Did the tree change? If yes, inject a Meta Node!
                if last_used_tree and decision_node['tree_id'] != last_used_tree:
                    action_name = "Nodelock Applied" if decision_node['has_direct_lock'] else f"World: {decision_node['tree_id']}"
                    timeline.append({"type": "meta", "action": action_name, "street": streets[current_street_idx], "node_id": decision_node['node_id']})
                last_used_tree = decision_node['tree_id']

                timeline.append({"type": "action", "street": streets[current_street_idx], "player": current_player, "action": act, "node_id": decision_node['node_id']})

            # Advance state
            route_so_far = act if route_so_far == "Base_Node" else f"{route_so_far}-{act}"

            if act == 'C' or (act == 'X' and current_player == 'BTN'):
                current_street_idx += 1
                current_player = "BB"
                if current_street_idx == 1 and len(target['board']) >= 8:
                    current_board = target['board'][:8]
                    board_node = get_historical_node(current_board, route_so_far)
                    if board_node: timeline.append({"type": "board", "street": "turn", "cards": current_board[6:8], "node_id": board_node['node_id']})
                elif current_street_idx == 2 and len(target['board']) >= 10:
                    current_board = target['board'][:10]
                    board_node = get_historical_node(current_board, route_so_far)
                    if board_node: timeline.append({"type": "board", "street": "river", "cards": current_board[8:10], "node_id": board_node['node_id']})
                continue

            current_player = "BTN" if current_player == "BB" else "BB"

        # 4. Append the Active Node (Frontier)
        timeline.append({"type": "active_node", "street": streets[current_street_idx], "player": current_player, "has_lock": bool(target['has_direct_lock']), "node_id": node_id})

        return {"timeline": timeline}


# ==============================================================================
# 2. NAVIGATION (Unchanged)
# ==============================================================================
# ==============================================================================
# 2. NAVIGATION (The Robust Sync Fix)
# ==============================================================================
@app.get("/api/navigation/{node_id}")
def get_navigation(node_id: int):
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("SELECT board, postflop_route, tree_id, matrix_json FROM Nodes WHERE node_id = ?", (node_id,))
        node = cursor.fetchone()
        if not node: return {}

        board, route, current_tree = node['board'], node['postflop_route'], node['tree_id']
        active_player_name = "BTN" if get_active_player_idx(route) == 1 else "BB"

        cursor.execute("SELECT node_id, tree_id, has_direct_lock, matrix_json FROM Nodes WHERE board = ? AND postflop_route = ?", (board, route))
        parallel_nodes = cursor.fetchall()

        raw_worlds, strategy_locks = [], []
        
        # 1. Strictly identify the root Structural Node for the exact state we are in
        default_node_id = next((r['node_id'] for r in parallel_nodes if not r['has_direct_lock'] and r['tree_id'] == current_tree), None)
        if not default_node_id:
            default_node_id = next((r['node_id'] for r in parallel_nodes if not r['has_direct_lock']), node_id)
        
        for r in parallel_nodes:
            if r['has_direct_lock']:
                strategy_locks.append({"node_id": r['node_id'], "name": f"Nodelocked ({r['tree_id'][:4]})"})
            else:
                mat = json.loads(zlib.decompress(r['matrix_json']).decode('utf-8'))
                clean_codes = [c.get('action', {}).get('code', 'X') for c in mat.get('action_solutions', [])]
                code_str = ", ".join([c if c != 'X' else 'Check' for c in clean_codes])
                raw_worlds.append({"node_id": r['node_id'], "tree_id": r['tree_id'], "codes": code_str, "name": f"{active_player_name} World: [{code_str}]"})

        unique_worlds, seen_codes = [], set()
        
        # 🔥 THE FIX: Guarantee the current active structural world is injected FIRST
        active_world = next((w for w in raw_worlds if w['node_id'] == default_node_id), None)
        if active_world:
            unique_worlds.append(active_world)
            seen_codes.add(active_world['codes'])
            
        for w in raw_worlds:
            if w['codes'] not in seen_codes: 
                unique_worlds.append(w)
                seen_codes.add(w['codes'])

        if strategy_locks: strategy_locks.insert(0, {"node_id": default_node_id, "name": "Default Strategy"})

        matrix = json.loads(zlib.decompress(node['matrix_json']).decode('utf-8'))
        
        tree_lineage = []
        tid = current_tree
        while tid:
            if tid not in tree_lineage: tree_lineage.append(tid)
            if tid == 'base': break 
            cursor.execute("SELECT parent_tree_id FROM GameTrees WHERE tree_id=?", (tid,))
            pt = cursor.fetchone()
            tid = pt['parent_tree_id'] if pt and pt['parent_tree_id'] else 'base'

        children = []
        for sol in matrix.get('action_solutions', []):
            act_code = sol.get('action', {}).get('code')
            if not act_code: continue
            
            child_route = f"{route}-{act_code}" if route and route != "Base_Node" else act_code
            placeholders = ','.join(['?'] * len(tree_lineage))
            cursor.execute(f"SELECT node_id FROM Nodes WHERE postflop_route = ? AND tree_id IN ({placeholders}) LIMIT 1", [child_route] + tree_lineage)
            child_row = cursor.fetchone()
            
            children.append({"action": act_code, "node_id": child_row['node_id'] if child_row else None})

        return {"worlds": unique_worlds, "strategy_locks": strategy_locks, "children": children}

# ==============================================================================
# 3. THE GRID (Unchanged)
# ==============================================================================
@app.get("/api/node/{node_id}/player/{player_idx}")
def get_node_matrix(node_id: int, player_idx: int = 0):
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("SELECT board, matrix_json FROM Nodes WHERE node_id = ?", (node_id,))
        row = cursor.fetchone()
        if not row: raise HTTPException(status_code=404)

        board_cards = [row['board'][i:i+2] for i in range(0, len(row['board']), 2)] if row['board'] else []
        matrix_data = json.loads(zlib.decompress(row['matrix_json']).decode('utf-8'))
        player_data = matrix_data.get('players_info', [])[player_idx]
        action_sols = matrix_data.get('action_solutions', [])
        ranges = player_data.get('range', [])
        hand_eqs = player_data.get('hand_eqs', [])
        
        grid = { (r1+r2 if r1==r2 else r1+r2+'s' if RANKS.index(r1)>RANKS.index(r2) else r2+r1+'o'): {
            "cell_name": r1+r2 if r1==r2 else r1+r2+'s' if RANKS.index(r1)>RANKS.index(r2) else r2+r1+'o', 
            "total_weight": 0.0, "actions": {}, "combos": []
        } for r1 in reversed(RANKS) for r2 in reversed(RANKS) }

        for i in range(1326):
            weight = ranges[i] if i < len(ranges) else 0.0
            if weight <= 0: continue
            
            c1, c2 = get_combo_from_idx(i)
            if not c1: continue
            
            cell = grid[get_grid_key(c1, c2)]
            cell["total_weight"] += weight
            eq = hand_eqs[i] if i < len(hand_eqs) else 0.0
            
            tags = categorize_combo(c1, c2, board_cards, eq)
            combo_detail = { "cards": c1 + c2, "weight": weight, "equity": eq * 100, "tags": tags, "actions": {} }

            for act in action_sols:
                act_code = act.get('action', {}).get('code', 'Unknown')
                strat = (act.get('strategy', [])[i] * 100) if i < len(act.get('strategy', [])) else 0.0
                ev = act.get('evs', [])[i] if i < len(act.get('evs', [])) else 0.0
                
                if act_code not in cell["actions"]: cell["actions"][act_code] = {"strat_sum": 0.0, "ev_sum": 0.0}
                cell["actions"][act_code]["strat_sum"] += strat * weight
                cell["actions"][act_code]["ev_sum"] += ev * weight
                combo_detail["actions"][act_code] = { "strategy": strat, "ev": ev }
                
            cell["combos"].append(combo_detail)

        final_grid = []
        for key, cell in grid.items():
            w = cell["total_weight"]
            if w > 0:
                for act_code, sums in cell["actions"].items(): 
                    cell["actions"][act_code] = { "strategy": sums["strat_sum"] / w, "ev": sums["ev_sum"] / w }
            else:
                for act_code in cell["actions"].keys(): 
                    cell["actions"][act_code] = {"strategy": 0.0, "ev": 0.0}
                    
            cell["equity"] = max(cell["combos"], key=lambda c: c["equity"], default={"equity": 0})["equity"]
            final_grid.append(cell)

        return { "node_id": node_id, "grid": final_grid }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)