# Manual Testing Checklist for Texture Set Merge Feature

## Prerequisites
1. [ ] Backend API is running
2. [ ] Frontend development server is running
3. [ ] At least 3-4 texture sets created with different textures
4. [ ] One texture set with Albedo texture (source)
5. [ ] One texture set with some textures but not all (target)

## Test Scenarios

### ✅ Basic Drag-and-Drop
- [ ] Texture set cards are visible in grid
- [ ] Hover over a card shows slight scale effect
- [ ] Click and hold on a card to start dragging
- [ ] Card becomes semi-transparent while dragging
- [ ] Other cards remain visible and clickable

### ✅ Drag Feedback
- [ ] Hover over another card while dragging
- [ ] Target card shows blue border highlight
- [ ] Target card scales slightly (1.02x)
- [ ] Target card opacity changes
- [ ] Border highlight disappears when moving away

### ✅ Drop Validation - Self Drop
**Steps:**
1. Drag a texture set card
2. Drop it on itself
**Expected:**
- [ ] Warning toast appears: "Cannot merge a texture set with itself"
- [ ] No dialog opens
- [ ] Drag state is cleared

### ✅ Drop Validation - No Albedo
**Steps:**
1. Create a texture set without Albedo texture (only Normal, Roughness, etc.)
2. Drag this texture set onto another
**Expected:**
- [ ] Warning toast appears: "Source texture set does not have an Albedo texture to merge"
- [ ] No dialog opens
- [ ] Drag state is cleared

### ✅ Merge Dialog - Basic Display
**Steps:**
1. Drag a texture set with Albedo onto another texture set
**Expected:**
- [ ] Merge dialog opens
- [ ] Dialog title: "Merge Texture Sets"
- [ ] Source texture set name is displayed
- [ ] Target texture set name is displayed
- [ ] Message: "You are merging the Albedo texture from..."
- [ ] Dropdown for texture type selection is visible
- [ ] Cancel button is visible
- [ ] Merge button is visible but disabled (no selection yet)

### ✅ Texture Type Dropdown
**Steps:**
1. Open merge dialog
2. Click on texture type dropdown
**Expected:**
- [ ] Dropdown opens with available texture types
- [ ] Each option shows texture type label (e.g., "Albedo", "Normal", etc.)
- [ ] Texture types already in target set are NOT in the dropdown
- [ ] If Normal exists in target, it's not shown as option
- [ ] Can select an option from dropdown

### ✅ Merge Dialog - All Types Filled
**Steps:**
1. Create a target texture set with all 8 texture types filled
2. Drag another texture set onto it
**Expected:**
- [ ] Merge dialog opens
- [ ] Dropdown is disabled
- [ ] Info message appears: "The target texture set already has all texture types filled..."
- [ ] Yellow warning box with info icon
- [ ] Merge button remains disabled

### ✅ Successful Merge
**Steps:**
1. Drag a texture set with Albedo onto another texture set
2. Select "Roughness" from dropdown
3. Click "Merge" button
**Expected:**
- [ ] Merge button shows loading state
- [ ] Success toast appears: "Texture merged successfully as Roughness"
- [ ] Dialog closes
- [ ] Texture set list refreshes automatically
- [ ] Target texture set now shows updated texture count
- [ ] Can open target texture set detail to verify new texture was added

### ✅ Merge with Different Types
**Repeat successful merge test with each texture type:**
- [ ] Albedo
- [ ] Normal
- [ ] Height
- [ ] AO (Ambient Occlusion)
- [ ] Roughness
- [ ] Metallic
- [ ] Diffuse
- [ ] Specular

### ✅ Cancel Merge
**Steps:**
1. Open merge dialog by dragging and dropping
2. Select a texture type
3. Click "Cancel" button
**Expected:**
- [ ] Dialog closes
- [ ] No merge happens
- [ ] No API call made
- [ ] No toast notification
- [ ] Can immediately drag and drop again

### ✅ Dialog State Reset
**Steps:**
1. Open merge dialog
2. Select "Normal" from dropdown
3. Cancel dialog
4. Open merge dialog again (same or different texture sets)
**Expected:**
- [ ] Dropdown shows "Select a texture type" placeholder
- [ ] Previous selection (Normal) is NOT remembered
- [ ] Fresh state each time

### ✅ Multiple Sequential Merges
**Steps:**
1. Perform a successful merge (e.g., add Normal)
2. Immediately drag and drop again on same target
3. Perform another merge (e.g., add Roughness)
4. Repeat for multiple texture types
**Expected:**
- [ ] Each merge succeeds independently
- [ ] Dropdown correctly filters out newly added types
- [ ] Target texture count increments with each merge
- [ ] No state pollution between merges

### ✅ File Drop Still Works
**Steps:**
1. Drag a texture image file from file system
2. Drop it on the texture set grid area
**Expected:**
- [ ] File drop still works (creates new texture set)
- [ ] No interference with texture set drag-and-drop
- [ ] Proper distinction between file drops and texture set drops

### ✅ Error Handling - API Failure
**Steps:**
1. Stop the backend API
2. Perform a merge operation
**Expected:**
- [ ] Error is caught gracefully
- [ ] Error toast appears (red notification)
- [ ] Dialog remains open (doesn't close on error)
- [ ] Can retry or cancel
- [ ] No app crash

### ✅ Concurrent Operations
**Steps:**
1. Start a merge operation
2. While merge dialog is open, try to:
   - Click on another texture set
   - Start dragging another card
   - Open context menu
**Expected:**
- [ ] Modal blocks background interactions correctly
- [ ] Other operations are queued/blocked until dialog closes
- [ ] No race conditions or state corruption

### ✅ Edge Cases
- [ ] Empty texture set (no textures): Cannot be dragged as source
- [ ] Single texture set: Shows warning when trying to drop on itself
- [ ] Large texture set list (100+ sets): Drag-and-drop still performant
- [ ] Long texture set names: Names truncate properly in dialog
- [ ] Quick drag-and-drop (rapid movements): No flickering or state issues

### ✅ Visual Consistency
- [ ] Dialog styling matches other dialogs in app
- [ ] Toast notifications match app style
- [ ] Border highlight color is consistent with app theme
- [ ] Icons and spacing follow design system
- [ ] Responsive on different screen sizes

### ✅ Accessibility
- [ ] Can tab through dialog elements
- [ ] Dropdown is keyboard accessible
- [ ] Can press Enter to confirm merge
- [ ] Can press Escape to cancel
- [ ] Focus management is correct (returns to grid after close)

## Test Results Template

```
Date: _______________
Tester: _______________
Environment: Dev / Staging / Production

| Test Scenario | Pass | Fail | Notes |
|---------------|------|------|-------|
| Basic Drag-and-Drop | [ ] | [ ] | |
| Drag Feedback | [ ] | [ ] | |
| Drop Validation - Self Drop | [ ] | [ ] | |
| Drop Validation - No Albedo | [ ] | [ ] | |
| Merge Dialog - Basic Display | [ ] | [ ] | |
| Texture Type Dropdown | [ ] | [ ] | |
| Merge Dialog - All Types Filled | [ ] | [ ] | |
| Successful Merge | [ ] | [ ] | |
| Merge with Different Types | [ ] | [ ] | |
| Cancel Merge | [ ] | [ ] | |
| Dialog State Reset | [ ] | [ ] | |
| Multiple Sequential Merges | [ ] | [ ] | |
| File Drop Still Works | [ ] | [ ] | |
| Error Handling - API Failure | [ ] | [ ] | |
| Concurrent Operations | [ ] | [ ] | |
| Edge Cases | [ ] | [ ] | |
| Visual Consistency | [ ] | [ ] | |
| Accessibility | [ ] | [ ] | |

Overall Result: Pass / Fail
Comments: _______________________________________________
```

## Known Limitations
- Only Albedo texture from source is merged (by design)
- Cannot select multiple source textures at once
- Cannot preview texture before merging
- No undo functionality (need to manually remove texture)

## Bug Report Template
If you find any issues, please report using this template:

```
**Bug Title:** [Short description]

**Steps to Reproduce:**
1. 
2. 
3. 

**Expected Behavior:**


**Actual Behavior:**


**Screenshots:** [If applicable]

**Environment:**
- Browser: 
- OS: 
- Frontend version: 
- Backend version: 

**Console Errors:** [If any]


**Additional Context:**

```
