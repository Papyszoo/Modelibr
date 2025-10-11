# Visual Scene Builder - Feature Requirements

## Overview

This document outlines the requirements for a Visual Scene Builder feature that would allow users to create custom 3D environments as dynamic React components instead of configuration-based data.

## Background

The current environment system (implemented in PR #297) stores environments as database records with configurable properties:
- Light intensity
- Environment preset (HDR maps)
- Shadow settings (type, opacity, blur)
- Camera settings

While this works well for predefined configurations, users have requested the ability to create fully custom environments by composing Three.js/React Three Fiber components visually.

## Feature Request

### Core Concept

Instead of storing environments as JSON configuration data, store them as dynamically generated React TSX components that can be edited visually.

### Example Output

A default environment would be represented as a TSX file like:

```tsx
import { JSX, ReactNode } from "react";
import { Stage } from "@react-three/drei";

type DynamicEnvironmentProps = {
    children?: ReactNode;
};

function DynamicEnvironment({
    children,
}: DynamicEnvironmentProps): JSX.Element {
    return (
        <Stage
            intensity={0.5}
            environment="city"
            shadows={{ type: 'contact', opacity: 0.4, blur: 2 }}
            adjustCamera={false}
        >
            {children}
        </Stage>
    );
}

export default DynamicEnvironment;
```

## Functional Requirements

### 1. Visual Scene Editor

**FR-1.1: Component Canvas**
- Provide a Three.js canvas where users can visually arrange scene elements
- Support real-time preview of the environment being built
- Display a hierarchy/tree view of components in the scene

**FR-1.2: Component Library**
- Provide a palette/library of available components users can add:
  - **React Three Fiber primitives:**
    - Lights (ambientLight, directionalLight, pointLight, spotLight, hemisphereLight)
    - Meshes (basic geometries: box, sphere, plane, cylinder, etc.)
    - Groups (for organizing components)
  - **React Three Drei components:**
    - Stage
    - Environment (HDR environments)
    - ContactShadows, AccumulativeShadows
    - Sky, Stars
    - Backdrop
    - Grid, GizmoHelper
    - Custom helpers and effects

**FR-1.3: Drag-and-Drop Interface**
- Allow users to drag components from the library into the scene
- Support drag-to-reorder in the hierarchy
- Visual indicators for valid drop zones

**FR-1.4: Component Properties Panel**
- Display editable properties for selected components
- Support various input types:
  - Numbers (with sliders for ranges)
  - Colors (color picker)
  - Vectors (x, y, z inputs)
  - Dropdowns (for enums/presets)
  - Toggles (booleans)
  - Text inputs (strings)

**FR-1.5: Transform Controls**
- Gizmos for translating, rotating, and scaling objects
- Numeric inputs for precise control
- Reset/copy/paste transform values

### 2. Code Generation

**FR-2.1: TSX File Generation**
- Dynamically generate valid TypeScript/TSX code based on scene composition
- Generate proper imports for used components
- Include TypeScript type definitions
- Format code with proper indentation and styling

**FR-2.2: Code Preview**
- Show generated code in a read-only code editor
- Syntax highlighting for TypeScript/JSX
- Option to copy generated code to clipboard

**FR-2.3: Code Validation**
- Validate generated code for TypeScript errors
- Check for missing dependencies
- Warn about potential runtime issues

### 3. File Management

**FR-3.1: Save Environment as TSX**
- Save generated TSX files to the file system
- Backend API endpoint to handle file creation
- Naming conventions and file path management
- Validation to prevent overwriting system files

**FR-3.2: Load Existing Environments**
- Parse existing TSX files into visual representation
- Support loading both user-created and built-in environments
- Handle migration from old configuration-based environments

**FR-3.3: Version Control**
- Track changes to environment files
- Support undo/redo operations
- Optional: Integration with git for versioning

### 4. Dynamic Component Loading

**FR-4.1: Runtime Import**
- Dynamically import TSX components at runtime
- Hot reload when environment files change
- Error handling for failed imports

**FR-4.2: Lazy Loading**
- Load environment components on-demand
- Optimize bundle size by code-splitting

**FR-4.3: Component Registry**
- Maintain registry of available environments
- Support both static (built-in) and dynamic (user-created) environments

### 5. Code Editor Integration

**FR-5.1: Manual Code Editing**
- Embedded code editor (e.g., Monaco Editor)
- TypeScript/JSX syntax highlighting
- Auto-completion for Three.js/Drei components
- Real-time error checking

**FR-5.2: Bidirectional Sync**
- Changes in visual editor update code
- Changes in code editor update visual representation
- Conflict resolution when manual edits can't be parsed

**FR-5.3: Code Snippets**
- Library of common patterns/snippets
- Quick insert for frequently used components
- Custom snippet creation

## Non-Functional Requirements

### NFR-1: Performance
- Scene editor should maintain 60 FPS with up to 50 components
- Code generation should complete in < 100ms
- File operations should be non-blocking

### NFR-2: Security
- **Critical:** Sanitize user-generated code before execution
- Prevent arbitrary code execution vulnerabilities
- Sandbox environment execution
- Validate imports to allowed packages only
- File system access limited to designated environment directory

### NFR-3: Usability
- Intuitive drag-and-drop interface
- Clear visual feedback for all actions
- Helpful error messages and validation
- Keyboard shortcuts for common operations
- Mobile-responsive (view-only on mobile)

### NFR-4: Compatibility
- Support all existing environment configurations
- Backward compatibility with current system
- Migration path from data-based to code-based environments

### NFR-5: Maintainability
- Well-documented code generation templates
- Extensible component library architecture
- Clear separation between editor and runtime systems

## Technical Considerations

### Architecture Options

**Option 1: Frontend-Only Generation**
- Generate TSX code in browser
- Save to backend via API
- Backend stores as files
- Pros: Simpler architecture
- Cons: Security concerns, limited validation

**Option 2: Backend Code Generation**
- Visual editor sends scene graph to backend
- Backend generates and validates TSX
- Returns validated code to frontend
- Pros: Better security, server-side validation
- Cons: More complex, network latency

**Option 3: Hybrid Approach**
- Frontend generates code for preview
- Backend validates and saves
- Pros: Best of both worlds
- Cons: Duplicate logic

### Technology Stack Considerations

**Visual Editor:**
- React Three Fiber for 3D scene
- React Three Drei for components
- Leva or similar for property controls
- React DnD for drag-and-drop

**Code Editor:**
- Monaco Editor (VS Code editor)
- Prettier for formatting
- TypeScript compiler API for validation

**Code Generation:**
- AST manipulation (Babel/TypeScript)
- Template-based generation
- Code formatting libraries

**File Management:**
- Backend: .NET file system APIs
- Security: Path validation, sanitization
- Storage: Dedicated directory for environments

### Security Measures

1. **Code Sandboxing:**
   - Run user code in isolated context
   - Limit available APIs and imports
   - Prevent access to sensitive operations

2. **Validation:**
   - Whitelist allowed imports
   - Validate component props against schemas
   - Check for malicious patterns

3. **File System:**
   - Restrict to designated directory
   - Validate file names and paths
   - Prevent directory traversal

4. **Execution:**
   - CSP headers for inline scripts
   - Separate runtime context
   - Error boundaries for failures

## User Stories

### US-1: Create Custom Environment
**As a** 3D artist  
**I want to** visually compose a custom environment with lights and effects  
**So that** I can create unique presentation settings for my models

**Acceptance Criteria:**
- Can add lights, meshes, and effects from component library
- Can adjust properties via visual controls
- Preview shows real-time changes
- Can save as reusable environment

### US-2: Edit Environment Code
**As a** developer  
**I want to** manually edit the generated TSX code  
**So that** I can fine-tune the environment beyond visual editor capabilities

**Acceptance Criteria:**
- Can view generated code
- Can edit code with syntax highlighting
- Changes in code update visual preview
- Validation shows errors before saving

### US-3: Share Environments
**As a** team member  
**I want to** export and share custom environments  
**So that** others can use my environment setups

**Acceptance Criteria:**
- Can export environment as TSX file
- Can import environments from files
- Imported environments work correctly
- Proper error handling for invalid files

### US-4: Migrate Existing Environments
**As a** existing user  
**I want to** convert my current environments to the new system  
**So that** I don't lose my configurations

**Acceptance Criteria:**
- Migration tool converts data to TSX
- All settings preserved
- Original environments still work
- Clear migration status/feedback

## Implementation Phases

### Phase 1: Foundation (MVP)
- Basic visual editor with Three.js canvas
- Component library (lights only)
- Simple property panel
- Basic code generation (hardcoded templates)
- File save/load API

### Phase 2: Enhanced Editor
- Full component library (all common components)
- Advanced property controls
- Transform gizmos
- Hierarchy tree view
- Better code generation (AST-based)

### Phase 3: Code Editor
- Monaco editor integration
- Bidirectional sync
- Code validation
- Snippets library

### Phase 4: Advanced Features
- Component presets/templates
- Animation support
- Custom component creation
- Team collaboration features
- Version control integration

## Migration Strategy

### From Current System

1. **Compatibility Layer:**
   - Keep existing environment API
   - Support both data and code-based environments
   - Runtime detection of environment type

2. **Conversion Tool:**
   - Automated conversion of data → TSX
   - Batch conversion for all environments
   - Validation of converted code

3. **User Flow:**
   - Prompt users about new system
   - Offer optional migration
   - Support both systems during transition
   - Gradual deprecation of old system

## Risks and Mitigation

### Risk 1: Security Vulnerabilities
**Impact:** High  
**Mitigation:**
- Strict code sandboxing
- Whitelist-based validation
- Security audit before release
- Regular security reviews

### Risk 2: Performance Issues
**Impact:** Medium  
**Mitigation:**
- Performance testing with complex scenes
- Optimization of code generation
- Lazy loading and code splitting
- Progressive enhancement

### Risk 3: Complex User Interface
**Impact:** Medium  
**Mitigation:**
- User testing and feedback
- Gradual feature rollout
- Comprehensive documentation
- Tutorial/onboarding flow

### Risk 4: Maintenance Burden
**Impact:** Medium  
**Mitigation:**
- Clean architecture
- Comprehensive tests
- Good documentation
- Modular design for updates

## Open Questions

1. **File Storage:** Should TSX files be stored in the repository, database, or separate storage?
2. **Versioning:** How to handle environment versioning and updates?
3. **Permissions:** Who can create/edit environments in team settings?
4. **Limits:** What limits on component count, file size, complexity?
5. **Testing:** How to test dynamically generated components?
6. **Deployment:** How to deploy environment updates without app restart?
7. **Fallbacks:** What happens if generated code fails to load?

## Success Metrics

- **Adoption:** X% of users create custom environments
- **Performance:** Code generation < 100ms, 60 FPS in editor
- **Reliability:** < 1% error rate in generated code
- **Satisfaction:** User satisfaction score > 4/5
- **Migration:** Y% of old environments successfully migrated

## References

- Current Environment Implementation: PR #297
- React Three Fiber: https://docs.pmnd.rs/react-three-fiber
- React Three Drei: https://github.com/pmndrs/drei
- Monaco Editor: https://microsoft.github.io/monaco-editor/
- TypeScript Compiler API: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API

## Next Steps

1. Review and validate requirements with stakeholders
2. Create detailed technical design document
3. Proof of concept for code generation
4. Security assessment and threat modeling
5. Create new GitHub issue with these requirements
6. Break down into implementable tasks
7. Prioritize features for MVP

---

**Document Version:** 1.0  
**Created:** 2025-10-11  
**Author:** GitHub Copilot  
**Status:** Draft for Review
