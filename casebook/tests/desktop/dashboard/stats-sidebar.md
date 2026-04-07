---
title: Sidebar stats panel displays correctly
platform: desktop
status: pass
priority: P1
---

## Preconditions

1. Casebook application is open
2. A project directory containing test cases has been loaded
3. Currently on the Dashboard view

## Steps

1. View the left sidebar on the Dashboard page
2. Check the stats card display
3. Click different status stat buttons
4. Observe the test case list filtering effect

## Expected Results

1. The sidebar displays three stats cards:
   - PASS (green): shows the count and percentage of passed tests
   - BLOCKED (yellow): shows the count and percentage of blocked tests
   - TODO (gray): shows the count and percentage of pending tests
2. After clicking a status button, the test case tree shows only cases with the corresponding status
3. Percentages are calculated correctly: (count of status / total) × 100%
