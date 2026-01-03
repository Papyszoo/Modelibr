# Modelibr - AI Agent Rules

## Core Behavior

### 1. Ask, Don't Guess
- **Never guess** what functionality should do - ask the user
- If requirements are ambiguous, present clarifying questions before implementing
- When reviewing existing code and purpose is unclear, ask user and document in relevant `docs/` file

### 2. Review Before Implementing
- **Always check existing code first** - look for similar or reusable functionality
- If similar code exists, propose making it **generic** rather than duplicating
- Present reasoning and alternative approaches when something doesn't make sense
- Question architectural decisions that seem inconsistent
- **When user mentions future goals, add them to `docs/docs/roadmap.md`** (don't wait to be asked)
- **When a task is completed**: Document it if needed (user docs, AI docs, or code comments), then **remove it from the roadmap** - move to "Completed" section with date

### 3. Keep Documentation Updated
- When changing functionality, **update relevant docs** (in `docs/` directory)
- If you discover undocumented behavior, add it to the appropriate doc
- **Restructure docs** if a different structure would be more useful

**Documentation should contain:**
- **Where to look**: All locations (backend, frontend, worker, tests) relevant to a feature
- **Reasoning**: Why the functionality exists, what problem it solves
- **Effects**: What other parts of the system are affected by changes

### 4. Proactive Code Review
- **Look for bad code or practices** in existing codebase and tell user what can be improved
- **Research best practices online** for functionality and usability - propose changes that make more sense
- Review existing functionality for consistency and UX improvements
- Suggest refactoring opportunities when you spot them

### 5. E2E Testing
- **Always create E2E tests** for new functionality to prevent future breakage
- **Review existing tests** when making changes - update them if behavior changes
- **Run E2E tests** after implementing features to verify nothing broke
- **Suggest new E2E tests** or improvements to existing tests that would better detect feature breakage
- E2E test documentation: `tests/e2e/README.md`

### 6. Report Status and Implementation Details
- **Inform user on work done** - explain how the solution was implemented
- **Describe challenges encountered** and how they were resolved
- User can read and understand code - provide technical details
- Don't just say "done" - explain the approach and any trade-offs made


### 7. Testing Guidelines
- **Run relevant tests** when adding new tests or functionality to ensure everything passes
- **Never change functionality** when fixing tests - tests should adapt to implementation
- **Always confirm intended functionality** by asking the user before modifying behavior to make a test pass
- Tests should be **focused on ensuring quality** and detecting functionality issues
- **Never cut corners** - always make sure tests are useful and verify real scenarios
- **ALL TESTS MUST PASS** - Ensure all unit, integration, and E2E tests pass before considering a task complete. Fix any regressions immediately.

---

## Running & Testing the Application

### Start the Application (E2E Environment)
```bash
cd tests/e2e
docker compose -f docker-compose.e2e.yml up -d --build
```

Wait ~20 seconds for containers to be healthy.

### Application URLs
| Service | URL |
|---------|-----|
| Frontend | http://localhost:3002 |
| API | http://localhost:8090 |
| API Health | http://localhost:8090/health |

### Run E2E Tests
```bash
cd tests/e2e
node run-e2e.js          # Full run with cleanup
npm run test:quick       # Quick run (existing containers)
```

### Test API Directly
```bash
# Health check
curl http://localhost:8090/health

# List models
curl http://localhost:8090/models

# Upload model
curl -X POST http://localhost:8090/models -F "file=@path/to/model.glb"
```

### Cleanup
```bash
cd tests/e2e
docker compose -f docker-compose.e2e.yml down -v
rm -rf ./data
```

---

## Project Constraints

### Offline-First
All features MUST work completely offline. Never suggest solutions requiring external API calls.

### Clean Architecture
```
WebApi → Application → Domain ← Infrastructure
              ↓              ↑
         SharedKernel ← ← ← ←
```

| Layer | Contains | Dependencies |
|-------|----------|--------------|
| Domain | Entities, Value Objects, Business Logic | SharedKernel only |
| Application | Commands, Queries, Handlers, Interfaces | Domain |
| Infrastructure | EF Core, Repositories, File Storage | All layers |
| WebApi | Endpoints, HTTP handling | Application |

### Environment Variables
- **All config in main `.env` file** - never create subdirectory .env files
- **Always update `.env.example`** when adding variables
- Never hardcode URLs or override .env values in docker-compose

---

## Key Locations

| What | Where |
|------|-------|
| **Roadmap / Tasks** | `docs/docs/roadmap.md` |
| API entry point | `src/WebApi/Program.cs` |
| DI registration | `src/*/DependencyInjection.cs` |
| API client (frontend) | `src/frontend/src/services/ApiClient.ts` |
| E2E tests | `tests/e2e/` (see `tests/e2e/README.md`) |
| User documentation | `docs/` (Docusaurus site) |
| Backend docs (AI) | `docs/docs/ai-documentation/BACKEND_API.md` |
| Frontend docs (AI) | `docs/docs/ai-documentation/FRONTEND.md` |
| Worker docs (AI) | `docs/docs/ai-documentation/WORKER.md` |
| Blender addon docs (AI) | `docs/docs/ai-documentation/BLENDER_ADDON.md` |
| Testing docs (AI) | `docs/docs/ai-documentation/TESTING.md` |

---

## Collaboration Mode

Activate with `/collab-mode` for ADHD-friendly collaboration:
- Present options with pros/cons before implementing
- Pause at architecture, naming, and dependency decisions
- Show code examples before applying changes
- Checkpoint after significant steps
