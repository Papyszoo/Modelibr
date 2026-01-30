# Sounds Feature E2E Tests

This directory contains E2E tests for the Sounds feature in Modelibr.

## Test Structure

### Feature Files

1. **01-setup.feature** (`@setup @sounds-setup`)
   - Creates initial test data for sound CRUD operations
   - Uploads a test sound named "crud-test-sound"
   - Stores sound in shared state for use by dependent scenarios

2. **02-sound-crud.feature** (`@depends-on:sounds-setup @sounds @crud`)
   - Tests sound upload with custom naming
   - Tests sound renaming via API
   - Tests sound deletion via API

3. **03-categories.feature** (`@depends-on:sounds-setup @sounds @categories`)
   - Tests creating sound categories
   - Tests updating category names
   - Tests deleting categories

## Test Assets

- **test-tone.wav** - A 1-second 440Hz sine wave tone (88KB WAV file)
  - Used for all sound upload tests
  - Generated using Python wave library

## Step Definitions

Located in `steps/sounds.steps.ts`:

### Navigation
- `Given I am on the sounds page` - Navigates to sounds page

### Sound CRUD
- `When I upload a sound named {string} from {string}` - Uploads audio file and renames
- `Then I store the sound {string} in shared state` - Stores sound for later use
- `Given the sound {string} exists in shared state` - Verifies sound in shared state
- `When I open the sound {string} for viewing` - Opens sound detail modal
- `When I change the sound name to {string}` - Renames sound via API
- `When I save the sound changes` - Saves changes (API or dialog)
- `When I delete the sound {string} via API` - Deletes sound via API

### Category Management
- `When I open the sound category management dialog` - Opens category dialog
- `When I create a sound category named {string}` - Creates category
- `When I create a sound category named {string} with description {string}` - Creates category with description
- `Then the sound category {string} should be visible in the category list` - Verifies category exists
- `Then I store the sound category {string} in shared state` - Stores category
- `When I edit the sound category {string}` - Opens edit dialog for category
- `When I change the sound category name to {string}` - Updates category name
- `When I save the sound category changes` - Saves category changes
- `When I delete the sound category {string}` - Deletes category with confirmation

### Assertions
- `Then the sound {string} should be visible in the sound list` - Verifies sound visibility
- `Then the sound {string} should not be visible` - Verifies sound is hidden/deleted

## Shared State

Sound and category data is stored in `fixtures/shared-state.ts`:

```typescript
interface SoundData {
    id: number;
    name: string;
    fileId: number;
    duration: number;
    categoryId?: number;
}

interface SoundCategoryData {
    id: number;
    name: string;
    description?: string;
}
```

Methods:
- `saveSound(name, data)` / `getSound(name)` / `hasSound(name)`
- `saveSoundCategory(name, data)` / `getSoundCategory(name)` / `hasSoundCategory(name)`

## API Endpoints Used

- `GET /sounds` - List all sounds
- `POST /sounds/with-file` - Upload sound with file (multipart/form-data)
- `PUT /sounds/{id}` - Update sound metadata
- `DELETE /sounds/{id}` - Delete sound
- `GET /sound-categories` - List categories
- `POST /sound-categories` - Create category
- `PUT /sound-categories/{id}` - Update category
- `DELETE /sound-categories/{id}` - Delete category

## Frontend Selectors

- `.sound-card` - Sound card container
- `.sound-name` - Sound name text
- `.sound-duration` - Duration display
- `.category-tab` - Category filter tabs
- `input[type='file']` - File upload input
- `button:has-text('Add Category')` - Category creation button
- `#categoryName` - Category name input (PrimeReact)
- `#categoryDescription` - Category description textarea (PrimeReact)

## Running the Tests

```bash
cd tests/e2e
npm run test:e2e -- --grep "@sounds"
```

Or run specific scenarios:
```bash
npm run test:e2e -- --grep "@sounds-setup"
npm run test:e2e -- --grep "@crud"
npm run test:e2e -- --grep "@categories"
```

## Notes

- Sound upload uses the same file input pattern as sprites
- Rename and category assignment use API calls instead of UI interactions
- Categories use PrimeReact dialog components with specific IDs (#categoryName, #categoryDescription)
- Test waits 3 seconds after upload to allow processing to complete
- Page reload after changes ensures UI reflects API updates
