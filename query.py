#!/usr/bin/env python3
import sqlite3
import json
import zlib
import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'poker_database.sqlite')

# --- DECK & TRIANGULAR MATH MAPPING ---
RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
SUITS = ['c', 'd', 'h', 's']
DECK = [r + s for r in RANKS for s in SUITS]

def get_card_idx(card_str):
    try: return DECK.index(card_str)
    except ValueError: return -1

def get_combo_idx(c1_str, c2_str):
    i1, i2 = get_card_idx(c1_str), get_card_idx(c2_str)
    if i1 == -1 or i2 == -1 or i1 == i2: return -1
    if i1 < i2: i1, i2 = i2, i1
    return (i1 * (i1 - 1)) // 2 + i2

def get_combo_from_idx(idx):
    for c1 in range(1, 52):
        base = (c1 * (c1 - 1)) // 2
        max_idx = base + (c1 - 1)
        if idx <= max_idx: return DECK[c1] + DECK[idx - base]
    return "Unknown"

# --- ROUTE FORMATTER ---
def format_route(route_raw):
    if isinstance(route_raw, list): return "-".join([str(x) for x in route_raw if x])
    return str(route_raw)

# --- PAYLOAD PARSER ---
def print_payload_summary(payload):
    if not payload: return
    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict):
                hist = format_route(item.get('action_history', 'Unknown'))
                acts = item.get('actions', 'Unknown')
                print(f"    ⚙️ [Tree Op] Target Node: {hist} | New Actions: {acts}")
            else:
                print(f"    ⚙️ [Edit]: {item}")
    elif isinstance(payload, dict):
        if 'tree_operations' in payload:
            print_payload_summary(payload['tree_operations'])
        else:
            if 'action_history' in payload:
                print(f"    📍 Target Node: {format_route(payload.get('action_history'))}")
            if 'strategy' in payload:
                print(f"    🎨 Strategy manually painted.")
            if 'hands_locked' in payload:
                print(f"    🔒 Specific combos frozen.")

# --- DNA SCANNER ---
def find_global_locks_with_ids(cursor, tree_history):
    locks = []
    seen_routes = set()
    
    def hunt(obj, t_id):
        if isinstance(obj, dict):
            if ('strategy' in obj or 'hands_locked' in obj) and 'action_history' in obj:
                route = format_route(obj['action_history']) or "Preflop"
                unique_key = f"{t_id}_{route}"
                if unique_key not in seen_routes:
                    seen_routes.add(unique_key)
                    locks.append({'route': route, 'tree_id': t_id})
            for v in obj.values(): hunt(v, t_id)
        elif isinstance(obj, list):
            for i in obj: hunt(i, t_id)

    for t in tree_history:
        if t['edit_payload']:
            try: hunt(json.loads(t['edit_payload']), t['tree_id'])
            except: pass

    enriched_locks = []
    for lock in locks:
        cursor.execute("SELECT node_id FROM Nodes WHERE tree_id = ? AND postflop_route = ? ORDER BY timestamp DESC LIMIT 1", 
                       (lock['tree_id'], lock['route']))
        row = cursor.fetchone()
        enriched_locks.append({
            'route': lock['route'],
            'tree_id': lock['tree_id'],
            'node_id': row['node_id'] if row else None
        })
        
    return enriched_locks

def print_recent_nodes(cursor):
    cursor.execute("SELECT node_id, board, postflop_route, tree_id FROM Nodes ORDER BY timestamp DESC LIMIT 10")
    recent_nodes = cursor.fetchall()
    if not recent_nodes:
        print("📭 Database is empty.")
        sys.exit(0)
    print("\n--- 🗄️ RECENTLY SAVED NODES ---")
    for row in recent_nodes:
        print(f"[{row['node_id']:<2}]    Board: {row['board']:<10} | Route: {row['postflop_route']:<14} | Tree ID: {row['tree_id'][:8]}...")

def inspect_node_loop(conn, start_node_id):
    cursor = conn.cursor()
    current_node_id = start_node_id

    while current_node_id:
        cursor.execute("SELECT * FROM Nodes WHERE node_id = ?", (current_node_id,))
        node = cursor.fetchone()
        
        if not node:
            print(f"🚨 Node ID {current_node_id} not found.")
            break

        matrix = json.loads(zlib.decompress(node['matrix_json']).decode('utf-8'))

        tree_history = []
        current_tree_id = node['tree_id']
        while current_tree_id and current_tree_id != 'base':
            cursor.execute("SELECT * FROM GameTrees WHERE tree_id = ?", (current_tree_id,))
            tree_row = cursor.fetchone()
            if not tree_row: break
            tree_history.append(tree_row)
            current_tree_id = tree_row['parent_tree_id']
        tree_history.reverse()

        print("\n\n" + "="*50)
        print(f"🚀 JUMPED TO NODE ID: {current_node_id}")
        print("="*50)
        print("🧬 TREE DNA & LOCK HISTORY")
        print("-" * 50)
        print("🌳 Base GTO Solution")
        for i, t in enumerate(tree_history):
            print("  ↓")
            print(f"[{i+1}] Custom Tree ID: {t['tree_id']}")
            if t['edit_payload']:
                try: print_payload_summary(json.loads(t['edit_payload']))
                except: pass

        cursor.execute("SELECT format, rake, eff_stack FROM GameTrees WHERE tree_id = ?", (node['tree_id'],))
        tree_meta = cursor.fetchone()
        pot_size = f"{matrix['game']['pot']} BB" if 'game' in matrix and 'pot' in matrix['game'] else "Unknown"

        print("\n🌍 UNIVERSE ASSUMPTIONS")
        print("-" * 50)
        if tree_meta:
            print(f"🏟️ Format:    {tree_meta['format']}")
            print(f"💸 Rake Tier: {tree_meta['rake']}")
            print(f"💵 Eff Stack: {tree_meta['eff_stack']} BB")
        print(f"💰 Pot Size:  {pot_size}")

        print("\n🔬 SPECIFIC NODE MATH")
        print("-" * 50)
        print(f"📍 Route: {node['postflop_route']}")
        
        act_sols = matrix.get('action_solutions') or []
        actions = [sol.get('action', {}).get('code', 'Unknown') for sol in act_sols]
        print(f"🎯 Options: {', '.join(actions) if actions else 'None (End of Action)'}")

        # --- RANGE EQUITY ---
        p_info = matrix.get('players_info') or [{}, {}]
        if len(p_info) > 1 and 'total_eq' in p_info[0]:
            print(f"🌍 Range Equity -> OOP: {p_info[0].get('total_eq', 0)*100:.1f}% | IP: {p_info[1].get('total_eq', 0)*100:.1f}%")
            print(f"💰 Range EV     -> OOP: {p_info[0].get('total_ev', 0):.2f} BB | IP: {p_info[1].get('total_ev', 0):.2f} BB")

        locked_array = matrix.get('hands_locked') or []
        num_locked = sum(1 for h in locked_array if h)
        if num_locked > 0:
            print(f"🔒 LOCAL LOCK: YES (🛡️ {num_locked} hand combos are frozen exactly here).")
        else:
            print(f"🔒 LOCAL LOCK: NO (Solver is choosing freely at this exact node).")

        global_locks = find_global_locks_with_ids(cursor, tree_history)

        print("\n==================================================")
        print("🔍 INTERACTIVE SHELL")
        print("==================================================")
        print(" • Type hand combo (e.g. AsKh) -> Math Breakdown, Equity, & EV")
        print(" • 'locks'  -> Show menu of downstream locks in this tree")
        print(" • 'jump 5' -> Teleport instantly to Node ID 5")
        print(" • 'home'   -> Return to Recent Nodes list")
        print(" • 'exit'   -> Quit script")

        while True:
            cmd = input(f"\n[Node {current_node_id}] 👉 Search: ").strip()
            if not cmd: continue
            
            cmd_lower = cmd.lower()

            if cmd_lower in ['exit', 'quit', 'q']: sys.exit(0)

            if cmd_lower == 'home':
                print_recent_nodes(cursor)
                current_node_id = None 
                break
                
            if cmd_lower.startswith('jump ') or cmd.isdigit():
                try:
                    target_id = int(cmd.split(' ')[1]) if cmd_lower.startswith('jump') else int(cmd)
                    current_node_id = target_id
                    break 
                except (IndexError, ValueError):
                    print("   ⚠️ Invalid jump command. Use 'jump <number>' or just type the number.")
                continue

            if cmd_lower == 'locks':
                if not global_locks:
                    print("   ℹ️ No downstream locks found in this specific tree lineage.")
                    continue
                print("\n   🌍 DOWNSTREAM LOCKS MENU:")
                for lock in global_locks:
                    if lock['node_id']:
                        print(f"   🟢 [ID: {lock['node_id']:<2}] Route: {lock['route']}")
                    else:
                        print(f"   🔴 [NO DB] Route: {lock['route']} (View this in GTOW to cache it!)")
                print("   👉 Type 'jump <ID>' to teleport to a green node.")
                continue

            if len(cmd) != 4:
                print("   ⚠️ Unknown command. Type 4 chars for a hand (AsKh) or a valid command.")
                continue
            
            idx = get_combo_idx(cmd[:2], cmd[2:])
            if idx == -1:
                print("   ⚠️ Invalid format. Use Rank (2-A) + Suit (c,d,h,s).")
                continue
                
            print(f"\n   📊 Math for {cmd}:")
            
            if locked_array and len(locked_array) > idx and locked_array[idx]:
                print("      🔒 THIS COMBO IS NODELOCKED HERE.")
                
            # Extract Weights
            w1 = p_info[0].get('range') or [] if len(p_info) > 0 else []
            w2 = p_info[1].get('range') or [] if len(p_info) > 1 else []
            weight_p1, weight_p2 = (w1[idx] if len(w1) > idx else 0.0), (w2[idx] if len(w2) > idx else 0.0)
            
            # --- UNCONDITIONAL EQUITY EXTRACTORS ---
            eq1 = p_info[0].get('hand_eqs') or [] if len(p_info) > 0 else []
            eq2 = p_info[1].get('hand_eqs') or [] if len(p_info) > 1 else []
            equity_p1, equity_p2 = (eq1[idx] if len(eq1) > idx else 0.0), (eq2[idx] if len(eq2) > idx else 0.0)

            eqr1 = p_info[0].get('hand_eqrs') or [] if len(p_info) > 0 else []
            eqr2 = p_info[1].get('hand_eqrs') or [] if len(p_info) > 1 else []
            eqr_p1, eqr_p2 = (eqr1[idx] if len(eqr1) > idx else 0.0), (eqr2[idx] if len(eqr2) > idx else 0.0)

            print(f"      ⚖️ Range Weights -> OOP: {weight_p1*100:.2f}% | IP: {weight_p2*100:.2f}%")
            
            # Now printing equity regardless of the player's range weight
            print(f"      🎯 OOP Equity: {equity_p1*100:.1f}% | EQ Realization: {eqr_p1*100:.1f}%")
            print(f"      🎯 IP Equity:  {equity_p2*100:.1f}% | EQ Realization: {eqr_p2*100:.1f}%")
            
            if weight_p1 == 0 and weight_p2 == 0:
                print("      👻 This combo is mathematically dead. Frequencies/EVs below are 'Ghost Math'.")
            
            if act_sols:
                for sol in act_sols:
                    act_code = sol.get('action', {}).get('code', 'Unknown')
                    strat = sol.get('strategy') or []
                    evs = sol.get('evs') or []
                    freq = strat[idx] * 100 if len(strat) > idx else 0.0
                    ev = evs[idx] if len(evs) > idx else 0.0
                    print(f"      ▶ {act_code:<5} | Freq: {freq:>6.2f}% | EV: {ev:>6.3f}")
            else:
                print("      ⚠️ No action solutions found.")

def main():
    if not os.path.exists(DB_PATH):
        print("🚨 Database not found! Make sure the extension is running.")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    print_recent_nodes(cursor)

    while True:
        try:
            cmd = input("\n👉 Enter Node ID to inspect (or 'exit'): ").strip()
            if cmd.lower() in ['exit', 'quit', 'q']: sys.exit(0)
            choice = int(cmd)
            inspect_node_loop(conn, choice)
        except ValueError:
            print("Invalid input. Enter a number.")

if __name__ == '__main__':
    main()