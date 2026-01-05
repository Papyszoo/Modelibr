# Texture Type Channel Mapping - Design Specification

Referenced from [roadmap.md](../roadmap.md) Priority 1.

---

## Overview

Enable ORM (Occlusion/Roughness/Metallic) channel-packed textures by separating **texture files** from **texture types**. Users can upload multi-channel images and map individual channels to different texture types.

---

## Texture Type Changes

### Types Removed
- `Diffuse` (redundant with Albedo)
- `Specular` (not PBR standard)

### Types Kept (RGB/Multi-Channel)
| Type | Channels | Notes |
|------|----------|-------|
| Albedo | RGB | Base color |
| Normal | RGB | Surface normals |
| Emissive | RGB | Glow areas |

### Types Kept (Single-Channel/Grayscale)
| Type | Channel | Notes |
|------|---------|-------|
| AO | Single (R/G/B/A) | Ambient occlusion |
| Roughness | Single | Surface roughness |
| Metallic | Single | Metallic areas |
| Alpha | Single | Transparency |

### Mutually Exclusive: Height / Displacement / Bump
These three types are **kept as separate enums** but with validation:
- Only ONE of Height, Displacement, or Bump can be assigned per texture set
- Backend validates this constraint on add/update
- Frontend shows a mode dropdown that switches between these three types
- Mode affects both Blender import AND Three.js preview (if supported)

---

## UI Design

### Merge Texture Sets Dialog (with Channel Mapping)

When dragging one texture set onto another, the merge dialog shows **each file from the source set** with channel mapping options. Focus is entirely on source set - target set is not modified except for adding new textures (with override confirmation if needed).

```
┌──────────────────────────────────────────────────────────┐
│ Merge "Source Set" into "Target Set"                    │
├──────────────────────────────────────────────────────────┤
│ Map textures from source:                                │
│                                                          │
│ ┌─────────┐  texture_orm.png                             │
│ │ preview │  RGB: [Split Channels ▼]                     │
│ │         │       R: [AO        ▼]                       │
│ └─────────┘       G: [Roughness ▼]                       │
│                   B: [Metallic  ▼]                       │
│              A:   [None ▼]                               │
│                                                          │
│ ┌─────────┐  texture_albedo.png                          │
│ │ preview │  RGB: [Albedo ▼]                             │
│ │         │  A:   [Alpha  ▼]                             │
│ └─────────┘                                              │
├──────────────────────────────────────────────────────────┤
│ ⚠ Roughness already exists in target - will be replaced │
├──────────────────────────────────────────────────────────┤
│                              [Cancel]  [Merge Textures]  │
└──────────────────────────────────────────────────────────┘
```

**RGB Channel Dropdown Options:**
- `None` - don't use this texture
- `Albedo` - use RGB as Albedo
- `Normal` - use RGB as Normal  
- `Emissive` - use RGB as Emissive
- `Split Channels` - expand to show R/G/B dropdowns for grayscale types

**When "Split Channels" is selected:**
- Show 3 additional dropdowns for R, G, B channels
- Each can be: None, AO, Roughness, Metallic, Height, Displacement, Bump, Alpha

**A (Alpha) Channel Dropdown:**
- Always visible as separate dropdown
- Options: None, Alpha, Height, Displacement, Bump

### Texture Set Viewer - Two Tabs

#### Tab 1: Files
Lists all texture files in the set with:
- Thumbnail preview of the file
- File name
- Channel mapping dropdowns for each available channel:

```
┌──────────────────────────────────────────────────────────┐
│ FILES                                                    │
├──────────────────────────────────────────────────────────┤
│ ┌─────────┐  texture_orm.png                             │
│ │ preview │  R: [AO        ▼]                            │
│ │         │  G: [Roughness ▼]                            │
│ └─────────┘  B: [Metallic  ▼]                            │
│              A: [None      ▼]                            │
├──────────────────────────────────────────────────────────┤
│ ┌─────────┐  texture_normal_height.png                   │
│ │ preview │  RGB: [Normal  ▼]                            │
│ │         │  A:   [Height  ▼] Mode: [Displacement ▼]     │
│ └─────────┘                                              │
├──────────────────────────────────────────────────────────┤
│ ┌─────────┐  texture_albedo.png                          │
│ │ preview │  RGB: [Albedo  ▼]                            │
│ │         │  A:   [Alpha   ▼]                            │
│ └─────────┘                                              │
└──────────────────────────────────────────────────────────┘
```

**Dropdown Options per Channel:**
- `None` (unmapped)
- For R/G/B/A single channels: AO, Roughness, Metallic, Alpha, Height, Displacement, Bump
- For RGB group: Albedo, Normal, Emissive
- Note: Height, Displacement, Bump are mutually exclusive - selecting one clears the others

#### Tab 2: Texture Types
Shows cards for each texture type with source selection:
- Each card has file dropdown + channel dropdown
- Preview shows extracted channel (grayscale) or RGB
- Height/Displacement/Bump shows ONE card with mode dropdown (selecting mode changes the type)

```
┌──────────────────────────────────────────────────────────┐
│ TEXTURE TYPES                                            │
├──────────────────────────────────────────────────────────┤
│ ┌─────────────────┐  ┌─────────────────┐  ┌────────────┐ │
│ │ ALBEDO          │  │ NORMAL          │  │ AO         │ │
│ │ ┌─────────┐     │  │ ┌─────────┐     │  │ ┌────────┐ │ │
│ │ │ preview │     │  │ │ preview │     │  │ │preview │ │ │
│ │ └─────────┘     │  │ └─────────┘     │  │ │(gray)  │ │ │
│ │ File: [albedo▼] │  │ File: [norm ▼]  │  │ └────────┘ │ │
│ │ Chan: [RGB   ▼] │  │ Chan: [RGB  ▼]  │  │ File:[orm▼]│ │
│ └─────────────────┘  └─────────────────┘  │ Chan:[R ▼] │ │
│                                           └────────────┘ │
├──────────────────────────────────────────────────────────┤
│ ┌─────────────────┐  ┌─────────────────┐  ┌────────────┐ │
│ │ ROUGHNESS       │  │ METALLIC        │  │HEIGHT CARD │ │
│ │ ┌─────────┐     │  │ ┌─────────┐     │  │ Type:      │ │
│ │ │ preview │     │  │ │ preview │     │  │[Displace▼] │ │
│ │ │ (gray)  │     │  │ │ (gray)  │     │  │ ┌────────┐ │ │
│ │ └─────────┘     │  │ └─────────┘     │  │ │preview │ │ │
│ │ File: [orm  ▼]  │  │ File: [orm  ▼]  │  │ └────────┘ │ │
│ │ Chan: [G    ▼]  │  │ Chan: [B    ▼]  │  │ File:[n_h▼]│ │
│ └─────────────────┘  └─────────────────┘  │ Chan:[A ▼] │ │
│                                           └────────────┘ │
└──────────────────────────────────────────────────────────┘
```

---

## Data Model Changes

### Backend: TextureType Enum
```csharp
public enum TextureType
{
    Albedo = 1,
    Normal = 2,
    Height = 3,        // Mutually exclusive with Displacement, Bump
    AO = 4,
    Roughness = 5,
    Metallic = 6,
    // Removed: Diffuse = 7, Specular = 8
    Emissive = 9,
    Bump = 10,         // Mutually exclusive with Height, Displacement
    Alpha = 11,
    Displacement = 12, // Mutually exclusive with Height, Bump
}
```

### Backend: Validation Rule
```csharp
// TextureSet domain validation
public static readonly TextureType[] MutuallyExclusiveHeightTypes = 
    { TextureType.Height, TextureType.Displacement, TextureType.Bump };

// On AddTexture: reject if another height-related type already exists
if (MutuallyExclusiveHeightTypes.Contains(newType) &&
    Textures.Any(t => MutuallyExclusiveHeightTypes.Contains(t.TextureType)))
{
    throw new InvalidOperationException(
        "Only one of Height, Displacement, or Bump can be assigned per texture set");
}
```

### Backend: Channel Mapping
New entity or value object to store:
```csharp
public class TextureChannelMapping
{
    public int FileId { get; set; }
    public TextureChannel SourceChannel { get; set; }  // R, G, B, A, RGB
    public TextureType TargetType { get; set; }
    public HeightMapMode? HeightMode { get; set; }  // Height, Displacement, Bump
}

public enum TextureChannel { R, G, B, A, RGB }
// No HeightMapMode needed - using separate TextureType enums with validation
```

---

## Implementation Phases

### Phase 1: Simplify Types (Quick Win)
- Remove Diffuse, Specular from enum
- Add validation: only one of Height/Displacement/Bump per texture set
- Update frontend to show mode dropdown for height types
- Update frontend type selector

### Phase 2: Channel Mapping (Major)
- Backend: Store channel mapping metadata
- Frontend: Files Tab with channel dropdowns
- Frontend: Texture Types Tab with file/channel selection
- Frontend: Real-time grayscale channel extraction for preview

### Phase 3: Integration
- Blender Addon: Import with channel mapping
- Thumbnail Worker: Handle channel-packed textures
- Three.js Viewer: Shader-based channel extraction

---

## Migration Strategy

Existing texture sets with Diffuse → Auto-map to Albedo
Existing texture sets with Specular → Mark as deprecated/unmapped
Existing Height/Displacement/Bump → Keep as-is (no migration needed)
