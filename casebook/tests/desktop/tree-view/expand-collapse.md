---
title: Tree view expand and collapse works correctly
platform: desktop
status: pass
priority: medium
---

## Preconditions

1. Casebook application is open
2. A test project with multi-level directory structure has been loaded
3. Currently on the Dashboard view

## Steps

1. View the directory structure in the left tree panel
2. Click on a folder with a `▶` arrow to expand its subdirectory
3. Click on a folder with a `▼` arrow to collapse its subdirectory
4. Click on a file-type test case
5. Observe the right detail panel

## Expected Results

1. Folders display a folder icon and a collapse arrow `▶`
2. After expanding, subdirectory contents are shown and the arrow changes to `▼`
3. After collapsing, subdirectory contents are hidden and the arrow reverts to `▶`
4. Files display a file icon and a left-side status color bar
5. Status color bar colors match the test status:
   - Green: pass
   - Red: blocked
   - Yellow: todo
   - Blue: in_progress
