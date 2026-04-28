"""
poker_evaluator.py
Highly optimized, standalone Texas Hold'em hand evaluator for bucket categorization.
"""

RANK_MAP = {'2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14}
SUITS = {'s', 'h', 'd', 'c'}

def _get_equity_bucket(equity: float) -> str:
    if equity >= 0.90: return "90-100%"
    if equity >= 0.80: return "80-90%"
    if equity >= 0.70: return "70-80%"
    if equity >= 0.60: return "60-70%"
    if equity >= 0.50: return "50-60%"
    if equity >= 0.25: return "25-50%"
    return "0-25%"

def _get_strength_bucket(equity: float) -> str:
    if equity >= 0.75: return "Best hands"
    if equity >= 0.50: return "Good hands"
    if equity >= 0.25: return "Weak hands"
    return "Trash hands"

def _check_straight_and_draws(unique_ranks: set, hole_ranks: tuple) -> tuple:
    """Returns (is_straight, is_oesd, is_gutshot, str_hole, oesd_hole, gut_hole)"""
    if not unique_ranks:
        return False, False, False, False, False, False
        
    ranks = set(unique_ranks)
    if 14 in ranks:
        ranks.add(1)
        
    hr = set(hole_ranks)
    if 14 in hr:
        hr.add(1)
        
    sorted_ranks = sorted(list(ranks), reverse=True)
    
    is_straight = is_oesd = is_gutshot = False
    str_hole = oesd_hole = gut_hole = False
    
    for i in range(len(sorted_ranks) - 3):
        chunk = sorted_ranks[i:i+4]
        
        # Straight check (5 cards)
        if i < len(sorted_ranks) - 4:
            chunk5 = sorted_ranks[i:i+5]
            if chunk5[0] - chunk5[4] == 4:
                is_straight = True
                if any(r in hr for r in chunk5):
                    str_hole = True
                    
        # Draw checks (4 cards)
        diff = chunk[0] - chunk[3]
        if diff == 3:
            if chunk[0] == 14 or chunk[3] == 1:
                is_gutshot = True
                if any(r in hr for r in chunk):
                    gut_hole = True
            else:
                is_oesd = True
                if any(r in hr for r in chunk):
                    oesd_hole = True
        elif diff == 4:
            is_gutshot = True
            if any(r in hr for r in chunk):
                gut_hole = True

    return is_straight, is_oesd, is_gutshot, str_hole, oesd_hole, gut_hole

def categorize_combo(c1: str, c2: str, board: list, equity: float) -> dict:
    result = {
        "made": "Nothing",
        "draw": "No draw",
        "strength": _get_strength_bucket(equity),
        "equity": _get_equity_bucket(equity)
    }

    if not board:
        return result

    # --- Data Parsing & Pre-computation ---
    h1_r, h1_s = RANK_MAP[c1[0]], c1[1]
    h2_r, h2_s = RANK_MAP[c2[0]], c2[1]
    hole_ranks = (h1_r, h2_r)
    
    board_ranks = sorted([RANK_MAP[c[0]] for c in board], reverse=True)
    board_suits = [c[1] for c in board]
    
    all_ranks = list(hole_ranks) + board_ranks
    all_suits = [h1_s, h2_s] + board_suits

    rank_counts = {}
    for r in all_ranks:
        rank_counts[r] = rank_counts.get(r, 0) + 1
        
    suit_counts = {}
    for s in all_suits:
        suit_counts[s] = suit_counts.get(s, 0) + 1

    unique_ranks = set(all_ranks)
    
    # --- Made Hands Evaluation ---
    is_flush = False
    flush_suit = None
    flush_uses_hole = False
    for s, count in suit_counts.items():
        if count >= 5:
            is_flush = True
            flush_suit = s
            if h1_s == s or h2_s == s:
                flush_uses_hole = True
            break

    is_straight, _, _, str_hole, _, _ = _check_straight_and_draws(unique_ranks, hole_ranks)
    
    # Straight Flush check
    is_straight_flush = False
    if is_flush and flush_uses_hole and is_straight:
        flush_cards_ranks = set(RANK_MAP[c[0]] for c in [c1, c2] + board if c[1] == flush_suit)
        is_sf, _, _, sf_h, _, _ = _check_straight_and_draws(flush_cards_ranks, hole_ranks)
        if is_sf and sf_h:
            is_straight_flush = True

    # Identify multiples and check if hole cards are involved
    quad_ranks = [r for r, c in rank_counts.items() if c == 4]
    has_quads = len(quad_ranks) > 0
    quad_hole = any(r in hole_ranks for r in quad_ranks)

    trip_ranks = [r for r, c in rank_counts.items() if c == 3]
    has_trip = len(trip_ranks) > 0
    trip_hole = any(r in hole_ranks for r in trip_ranks)

    pair_ranks = [r for r, c in rank_counts.items() if c == 2]
    pairs_count = len(pair_ranks)
    pair_hole = any(r in hole_ranks for r in pair_ranks)
    
    is_pocket_pair = (h1_r == h2_r)

    # Determine highest made hand
    if is_straight_flush:
        result["made"] = "Straight flush"
    elif has_quads and quad_hole:
        result["made"] = "Quads"
    elif has_trip and (pairs_count >= 1 or len(trip_ranks) > 1) and (trip_hole or pair_hole):
        result["made"] = "Full house"
    elif is_flush and flush_uses_hole:
        result["made"] = "Flush"
    elif is_straight and str_hole:
        result["made"] = "Straight"
    elif has_trip and is_pocket_pair and trip_hole:
        result["made"] = "Set"
    elif has_trip and trip_hole:
        result["made"] = "Three of a kind"
    elif pairs_count >= 2 and pair_hole:
        result["made"] = "Two pair"
    elif is_pocket_pair:
        if h1_r > board_ranks[0]:
            result["made"] = "Overpair"
        elif h1_r < board_ranks[-1]:
            result["made"] = "Low pair"
        else:
            result["made"] = "Underpair"
    elif pairs_count >= 1 and pair_hole:
        # User has a pair matching the board
        hole_pair_ranks = [r for r in pair_ranks if r in hole_ranks]
        if hole_pair_ranks:
            best_pair_r = max(hole_pair_ranks)
            if best_pair_r == board_ranks[0]:
                result["made"] = "Top pair"
            elif len(board_ranks) > 1 and best_pair_r == board_ranks[1]:
                result["made"] = "Second pair"
            elif len(board_ranks) > 2 and best_pair_r == board_ranks[2]:
                result["made"] = "Third pair"
            else:
                result["made"] = "Bottom pair"
    else:
        max_hole = max(h1_r, h2_r)
        if max_hole == 14:
            result["made"] = "Ace high"
        elif max_hole == 13:
            result["made"] = "King high"
        else:
            result["made"] = "Nothing"

    # --- Draws Evaluation ---
    max_suit_count = max(suit_counts.values()) if suit_counts else 0
    
    draw_flush_suit = [s for s, c in suit_counts.items() if c == 4 and (h1_s == s or h2_s == s)]
    is_flush_draw = len(draw_flush_suit) > 0
    is_fd_nuts = False
    
    if is_flush_draw:
        fd_suit = draw_flush_suit[0]
        if (c1[0] == 'A' and c1[1] == fd_suit) or (c2[0] == 'A' and c2[1] == fd_suit):
            is_fd_nuts = True

    _, _, _, _, oesd_hole, gut_hole = _check_straight_and_draws(unique_ranks, hole_ranks)

    is_sfd = False
    for s, count in suit_counts.items():
        if count >= 4 and (h1_s == s or h2_s == s):
            suited_ranks = set(RANK_MAP[c[0]] for c in [c1, c2] + board if c[1] == s)
            _, _, _, _, sfd_oesd_hole, sfd_gut_hole = _check_straight_and_draws(suited_ranks, hole_ranks)
            if sfd_oesd_hole or sfd_gut_hole:
                is_sfd = True
                break

    is_twocard_bdfd = False
    is_onecard_bdfd = False
    
    if not is_flush_draw and not is_sfd and max_suit_count == 3:
        if h1_s == h2_s:
            if board_suits.count(h1_s) == 1:
                is_twocard_bdfd = True
        else:
            if board_suits.count(h1_s) == 2 or board_suits.count(h2_s) == 2:
                is_onecard_bdfd = True

    # Determine highest draw
    if is_sfd:
        result["draw"] = "Straight flush draw"
    elif is_flush_draw and (oesd_hole or gut_hole):
        result["draw"] = "Combo draw"
    elif is_fd_nuts:
        result["draw"] = "Flush draw nuts"
    elif is_flush_draw:
        result["draw"] = "Flush draw"
    elif oesd_hole:
        result["draw"] = "OESD"
    elif gut_hole:
        result["draw"] = "Gutshot"
    elif is_twocard_bdfd:
        result["draw"] = "Twocard bdfd"
    elif is_onecard_bdfd:
        result["draw"] = "Onecard bdfd"

    return result