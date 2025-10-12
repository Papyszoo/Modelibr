## Upload Progress Window Visual Mockup

### Window Appearance

The upload progress window appears as a floating draggable window at the bottom of the application:

```
┌──────────────────────────────────────────────────────────┐
│ File Uploads                               ⌃  ✕           │ ← Header (draggable)
├──────────────────────────────────────────────────────────┤
│                                                            │
│ 📊 Summary Section                                        │
│ ┌────────────────────────────────────────────────────┐   │
│ │ Uploading 3 files...          [Clear Completed]    │   │
│ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░  65%                    │   │
│ └────────────────────────────────────────────────────┘   │
│                                                            │
│ 📂 Individual Upload Items                                │
│                                                            │
│ ┌────────────────────────────────────────────────────┐   │
│ │ 📦 🔷  model.obj                    2.5 MB    🗑   │   │
│ │        ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░  80%               │   │
│ └────────────────────────────────────────────────────┘   │
│                                                            │
│ ┌────────────────────────────────────────────────────┐   │
│ │ 🖼️  🎨  texture_albedo.png       1.2 MB  ↗️  🗑    │   │ ← Completed
│ │        ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  100% ✓             │   │
│ └────────────────────────────────────────────────────┘   │
│                                                            │
│ ┌────────────────────────────────────────────────────┐   │
│ │ 📄 🖼️  normal_map.jpg              800 KB         │   │
│ │        ▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░  25%               │   │
│ └────────────────────────────────────────────────────┘   │
│                                                            │
│ ┌────────────────────────────────────────────────────┐   │
│ │ ⚠️  ❌  unsupported.xyz            500 KB    🗑     │   │ ← Failed
│ │        File format not supported                     │   │
│ └────────────────────────────────────────────────────┘   │
│                                                            │
└──────────────────────────────────────────────────────────┘

Legend:
  📦 - Extension icon (for 3D models)
  🖼️ - Extension icon (for images)  
  📄 - Extension icon (generic file)
  🔷 - File type icon (model)
  🎨 - File type icon (texture)
  ↗️ - Open in new tab button
  🗑 - Remove upload button
  ⌃ - Collapse window
  ✕ - Close window
  ⚠️ - Error indicator
```

### Color Scheme

1. **Normal Upload Items**: Light gray background (`#f9fafb`)
   - Hover: Slightly darker gray (`#f3f4f6`)

2. **Completed Upload Items**: Green tinted background (`#f0fdf4`)
   - Hover: Slightly darker green (`#dcfce7`)
   - Icons: Green color (`#10b981`)

3. **Failed Upload Items**: Red tinted background (`#fef2f2`)
   - Hover: Slightly darker red (`#fee2e2`)
   - Icons: Red color (`#ef4444`)
   - Error text: Red (`#dc2626`)

4. **Header**: Purple gradient
   - Background: `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`
   - Text: White

5. **Progress Bars**: 
   - Default: Blue/purple from PrimeReact theme
   - Height: Small (0.375rem for items, 0.5rem for summary)

### Window Features

#### Positioning
- Fixed position at bottom of the panel
- Draggable within panel boundaries
- Cannot cross panel divider
- Z-index: 1000 (1001 when active)
- Respects 60px tab bar on both sides

#### Sizing
- Min width: 320px
- Max width: 450px
- Max height: 80vh
- Adapts to content

#### Interactions
1. **Drag Header**: Move window within panel
2. **Collapse Button**: Minimize to header only
3. **Close Button**: Hide window (uploads continue)
4. **Open in Tab**: Opens completed model in new tab
5. **Remove**: Remove individual upload from list
6. **Clear Completed**: Remove all completed/failed uploads

#### File Information Display
Each upload item shows:
- **Two Icons**: 
  - Left: File extension icon (based on file type)
  - Right: Upload type icon (model/texture/file)
- **File Name**: Truncated with ellipsis if too long
- **File Size**: Formatted (B, KB, MB, GB)
- **Progress Bar**: Visual progress indicator
- **Actions**: Context-specific buttons

#### Status Indicators
- **Pending**: Gray background, no progress
- **Uploading**: Gray background, progress bar animating
- **Completed**: Green background, 100% progress, checkmark
- **Error**: Red background, error icon and message

### Responsive Behavior

1. **Small Panels**: Window scales down but maintains minimum width
2. **Panel Resize**: Window repositions if it ends up on wrong panel
3. **Tab Switch**: Window stays visible and maintains state
4. **Multiple Uploads**: Scrollable list with custom scrollbar

### Accessibility

- Semantic HTML structure
- Clear visual states for each upload status
- Icon + text for better comprehension
- Keyboard accessible buttons
- ARIA labels where appropriate
- High contrast text and icons

### Animation

- **Window Entrance**: Slide in from bottom with fade
  ```css
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  ```
- **Collapse/Expand**: Smooth height transition
- **Progress Bars**: Smooth width transition
- **Hover States**: Subtle background color transitions
