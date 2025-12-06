# Modelibr Blender Addon - Testing Checklist

## Installation & Setup

- [ ] Addon installs without errors (Edit → Preferences → Add-ons → Install)
- [ ] Addon appears in addon list as "Import-Export: Modelibr"
- [ ] Addon can be enabled by checking the checkbox
- [ ] Preferences panel appears when expanded
- [ ] Server URL can be set
- [ ] API Key field accepts input
- [ ] Default export format can be changed
- [ ] "Always include .blend" toggle works

## Sidebar Panel Access

- [ ] Sidebar panel appears in 3D Viewport (Press N)
- [ ] "Modelibr" tab exists in sidebar
- [ ] Panel shows "Open Browser Window" button
- [ ] "Test Connection" button is visible
- [ ] Current model context displays when set
- [ ] "Clear" button removes model context

## Window Menu Access

- [ ] Window menu contains "Modelibr Browser" entry
- [ ] Entry is at the bottom of Window menu
- [ ] Entry has file browser icon
- [ ] Clicking entry opens browser window

## Search Access

- [ ] F3 opens search menu
- [ ] Typing "Modelibr" shows results
- [ ] "Modelibr Browser" operator appears
- [ ] Selecting it opens browser window

## Browser Window - General

- [ ] Browser window opens as modal dialog
- [ ] Window is 900px wide
- [ ] Window has proper title "Modelibr Browser"
- [ ] Window can be moved around screen
- [ ] Window stays on top while modal
- [ ] ESC key closes window
- [ ] OK button closes window
- [ ] Window remembers last tab when reopened

## Browse Tab - Layout

- [ ] Browse tab is selected by default
- [ ] Search box is visible at top
- [ ] Refresh button (🔄 icon) is next to search
- [ ] Thumbnail toggle button (🖼️ icon) is visible
- [ ] Split layout shows model list on left
- [ ] Details panel is on right side
- [ ] Tab icons are correct (Browse = file browser icon)

## Browse Tab - Functionality

- [ ] Clicking refresh loads models from server
- [ ] Loading indicator appears during fetch
- [ ] Model count displays correctly (e.g., "Models (15):")
- [ ] Models appear in scrollable list
- [ ] Search box filters models by name
- [ ] Search box filters models by tags
- [ ] Clearing search shows all models again
- [ ] Thumbnail toggle changes display state
- [ ] Error messages appear if connection fails
- [ ] Error messages wrap properly (60 chars)

## Browse Tab - Model Selection

- [ ] Clicking model selects it
- [ ] Selected model highlights
- [ ] Details panel updates when model selected
- [ ] Model name displays in details
- [ ] Model description displays if present
- [ ] Description text wraps at 30 chars
- [ ] Tags display with bookmark icon
- [ ] Creation date displays with time icon
- [ ] Thumbnail availability shows when thumbnails enabled
- [ ] "Import Model" button appears when model selected
- [ ] Button has correct model_id set

## Browse Tab - Import

- [ ] Clicking "Import Model" starts import
- [ ] Progress/status appears during import
- [ ] Model downloads successfully
- [ ] Model imports into Blender scene
- [ ] Correct file format is prioritized (GLB > FBX > OBJ > blend)
- [ ] Model context is set after import
- [ ] Header shows "Current: [Model Name]"
- [ ] Success message appears in Blender UI
- [ ] Error message appears if import fails

## Versions Tab - Prerequisites

- [ ] Tab shows "No model selected" message if no context
- [ ] Tab suggests "Import a model to view versions"
- [ ] Tab becomes active after model import
- [ ] Tab shows model name in header box

## Versions Tab - Layout

- [ ] "Load Versions" button appears
- [ ] Loading indicator shows during fetch
- [ ] Version list appears after loading
- [ ] Version list is scrollable
- [ ] Selected version highlights
- [ ] Details box shows below list
- [ ] Tab icon is correct (Versions = sequence icon)

## Versions Tab - Version List

- [ ] All versions appear in list
- [ ] Latest version is at top (or bottom, check order)
- [ ] Version numbers display correctly (e.g., "Version 3")
- [ ] File count shows in parentheses
- [ ] Active version has checkmark icon
- [ ] Clicking version selects it
- [ ] Selection updates details box

## Versions Tab - Version Details

- [ ] Version number displays (e.g., "Version #3")
- [ ] Description displays if present
- [ ] Creation date displays with time icon
- [ ] "Active Version ✓" shows for active version
- [ ] File list section appears
- [ ] Each file shows with appropriate icon
- [ ] File sizes display correctly (in KB/MB)
- [ ] "Import This Version" button appears
- [ ] Button has correct version_id set

## Versions Tab - Import Version

- [ ] Clicking "Import This Version" starts import
- [ ] Correct version downloads
- [ ] Correct files are imported
- [ ] Version context updates
- [ ] Success message appears
- [ ] Error handling works for failed imports

## Upload Tab - Layout

- [ ] Tab shows two sections when model context exists
- [ ] Top section is "Upload to: [Model Name]"
- [ ] "Upload New Version" button appears
- [ ] Separator line between sections
- [ ] Bottom section is "Create New Model"
- [ ] "Upload as New Model" button appears
- [ ] Info message shows when no model context
- [ ] Tab icon is correct (Upload = export icon)

## Upload Tab - Upload Version

- [ ] "Upload New Version" only shows with model context
- [ ] Clicking button opens dialog
- [ ] Dialog shows model name
- [ ] Description field is editable
- [ ] Export format dropdown works (GLB/FBX/OBJ)
- [ ] "Set as Active" checkbox toggles
- [ ] "Include .blend file" checkbox toggles
- [ ] OK button starts upload
- [ ] Cancel button cancels operation
- [ ] Upload progress/status shows
- [ ] Success message on completion
- [ ] Error message on failure

## Upload Tab - Upload New Model

- [ ] "Upload as New Model" always appears
- [ ] Clicking button opens dialog
- [ ] Model name field is editable
- [ ] Default name comes from .blend file if available
- [ ] Export format dropdown works
- [ ] "Include .blend file" checkbox toggles
- [ ] OK button starts upload (requires name)
- [ ] Cancel button cancels operation
- [ ] Error if name is empty
- [ ] Upload creates new model
- [ ] Success message appears
- [ ] Model context is set after upload

## Header Section

- [ ] "Test Connection" button always visible
- [ ] Button shows URL icon
- [ ] Clicking shows connection result
- [ ] Success: "Connection successful!" info message
- [ ] Failure: "Connection failed" error message
- [ ] Current model shows when context set
- [ ] Shows "Current: [Name]" or "Current: Model #[ID]"
- [ ] Object data icon appears
- [ ] X button appears next to current model
- [ ] X button clears model context
- [ ] Header updates when context changes

## Tab Switching

- [ ] All three tabs are always visible
- [ ] Active tab is highlighted
- [ ] Clicking tab switches view
- [ ] Previous tab content is preserved
- [ ] Tab state persists during session
- [ ] Each tab loads independently
- [ ] Switching tabs is instant (no loading)

## Thumbnail System

- [ ] Thumbnails cache in temp directory
- [ ] Cache directory: `/tmp/modelibr_thumbnails` (or OS equivalent)
- [ ] Cache persists across Blender sessions
- [ ] Thumbnails download automatically when enabled
- [ ] Cached thumbnails load instantly
- [ ] Failed downloads don't break UI
- [ ] Toggle works without errors
- [ ] Cache can be manually cleared (system temp cleanup)

## API Integration

- [ ] GET `/models` works (browse tab)
- [ ] GET `/models/{id}` works (model details)
- [ ] GET `/models/{id}/versions` works (versions tab)
- [ ] GET `/models/{id}/versions/{versionId}` works (version details)
- [ ] GET `/files/{id}` works (file download)
- [ ] GET `/models/{id}/thumbnail/file` works (thumbnails)
- [ ] POST `/models` works (create model)
- [ ] POST `/models/{id}/versions` works (create version)
- [ ] POST `/models/{id}/versions/{versionId}/files` works (add file)
- [ ] API key authentication works
- [ ] Unauthorized returns proper error
- [ ] Network errors are handled gracefully
- [ ] Timeout errors show user-friendly message

## Error Handling

- [ ] Connection errors display in UI
- [ ] API errors show descriptive messages
- [ ] Long error messages wrap properly
- [ ] Error alert styling (red box) appears
- [ ] Error icon shows with messages
- [ ] Errors don't crash Blender
- [ ] Console shows detailed errors for debugging
- [ ] User sees actionable error messages

## URI Handler Integration

- [ ] modelibr:// URIs are recognized (if handler installed)
- [ ] Opening URI launches Blender
- [ ] Model context is set from URI
- [ ] modelId parameter is parsed correctly
- [ ] versionId parameter is parsed correctly (if present)
- [ ] Browser can open after URI launch
- [ ] Context persists from URI launch

## Performance

- [ ] Browser opens quickly (< 1 second)
- [ ] Model list loads in reasonable time
- [ ] Large model lists (100+) remain responsive
- [ ] Thumbnail loading doesn't block UI
- [ ] Version list loads quickly
- [ ] Switching tabs is instant
- [ ] Search/filter is responsive
- [ ] No memory leaks after multiple open/close cycles
- [ ] Closing browser frees resources properly

## Compatibility

- [ ] Works in Blender 4.0
- [ ] Works in Blender 4.1 (if available)
- [ ] Works in Blender 4.2+ (if available)
- [ ] Works on Windows
- [ ] Works on macOS
- [ ] Works on Linux
- [ ] Works with different screen resolutions
- [ ] Works with HiDPI/Retina displays
- [ ] Works in different color themes (dark/light)

## Backward Compatibility

- [ ] Sidebar panel still works
- [ ] Old workflow (sidebar-only) unchanged
- [ ] Browse panel still accessible in sidebar
- [ ] Upload panel still accessible in sidebar
- [ ] Settings from v1.0 are preserved
- [ ] No breaking changes to existing users

## Integration with Sidebar

- [ ] "Open Browser Window" button works
- [ ] Button has correct icon (file browser)
- [ ] Clicking opens browser window
- [ ] Current model context syncs between sidebar and browser
- [ ] Clearing context in one updates the other
- [ ] Both interfaces can be used interchangeably

## Documentation

- [ ] README.md is up to date
- [ ] Installation instructions are clear
- [ ] Usage instructions are accurate
- [ ] Screenshots/diagrams are helpful (if added)
- [ ] WINDOW_INTERFACE.md is comprehensive
- [ ] USAGE_GUIDE.md has clear examples
- [ ] API endpoints are documented
- [ ] Troubleshooting section is helpful

## Code Quality

- [ ] No Python syntax errors
- [ ] All imports resolve correctly
- [ ] No circular dependencies
- [ ] Proper error handling throughout
- [ ] No hardcoded paths (uses temp directory)
- [ ] Code follows Blender addon conventions
- [ ] Comments are clear and helpful
- [ ] Functions have proper docstrings

## Edge Cases

- [ ] Empty server (no models) handled gracefully
- [ ] Model with no versions handled
- [ ] Version with no files handled
- [ ] Large file uploads don't timeout
- [ ] Special characters in model names work
- [ ] Very long model names wrap properly
- [ ] Very long descriptions wrap properly
- [ ] Network interruption during operation is handled
- [ ] Server restart during operation is handled
- [ ] Invalid model/version IDs show errors

## Cleanup

- [ ] Addon uninstalls cleanly
- [ ] Unregistration removes menu items
- [ ] Unregistration removes handlers
- [ ] Unregistration clears preview collections
- [ ] No lingering UI elements after uninstall
- [ ] Preferences are removed on uninstall
- [ ] Scene properties can be reset

## Final Checks

- [ ] All features from original issue are implemented
- [ ] Window-based interface works ✓
- [ ] "Data" section in Editor Type (note: added to Window menu instead)
- [ ] Thumbnail preview support ✓
- [ ] Model versions support ✓
- [ ] Implementation is complete
- [ ] Documentation is complete
- [ ] No major bugs identified
- [ ] Ready for user testing
- [ ] Ready for production use

## Notes

- The addon uses modal dialog window instead of true Editor Type because Blender's Python API doesn't support creating custom SpaceTypes
- Window menu placement is the standard pattern for browsing interfaces (similar to Asset Browser)
- All core requirements from the issue have been met with a practical, user-friendly implementation
