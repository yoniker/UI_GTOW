"""
test_evaluator.py
A simple script to test the poker_evaluator module.
"""
import time
from poker_evaluator import categorize_combo

# ==========================================
# 1. QUICK TEST: CHANGE THESE VALUES
# ==========================================
c1 = 'Ac'
c2 = 'Tc'
board = ['Kc','5c', '2h', '2s']  # Can be 0, 3, 4, or 5 cards
equity = 0.654              # Float between 0.0 and 1.0

print("--- SINGLE HAND TEST ---")
print(f"Hand: {c1}, {c2} | Board: {board} | Equity: {equity}")

# Run the function
result = categorize_combo(c1, c2, board, equity)

# Print the output nicely
import json
print(json.dumps(result, indent=4))
print("-" * 30)