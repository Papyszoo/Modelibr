# Modelibr Blender Addon Tests

Comprehensive test suite for the Modelibr Blender addon.

## Quick Start

```bash
# Run all unit tests (no Blender required)
python tests/run_tests.py

# Run all tests including E2E
python tests/run_tests.py --all
```

## Test Types

### 1. Unit Tests (`tests/unit/`)

No Blender required. Tests individual modules with mocked dependencies.

```bash
python tests/run_tests.py --unit
# or
python -m pytest tests/unit/ -v
```

**Coverage:**
- `test_api_client.py` - HTTP communication
- `test_tracking.py` - Object tracking (mocked bpy)
- `test_config.py` - Configuration values
- `test_async_handler.py` - Thread-safety

### 2. Integration Tests (`tests/integration/`)

Requires Blender. Tests addon registration and Blender API integration.

```bash
python tests/run_tests.py --integration
# or
blender --background --python tests/integration/run_in_blender.py
```

**Coverage:**
- Addon registration
- Preferences structure
- Property groups
- Operator registration
- Panel registration

### 3. E2E Tests (`tests/e2e/`)

Uses mock HTTP server. Tests complete workflows.

```bash
python tests/run_tests.py --e2e
# or
python -m pytest tests/e2e/ -v
```

**Coverage:**
- Import flow (list → get → download)
- Upload flow (create model → add version)
- Texture set handling
- Connection testing

## Requirements

```bash
# For pytest (optional but recommended)
pip install pytest

# For integration tests
# Blender 4.0+ in PATH
```

## CI/CD

```yaml
# Example GitHub Actions
jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: python tests/run_tests.py --unit --e2e
```

## Writing New Tests

### Unit Test Template

```python
import unittest
from unittest.mock import MagicMock, patch

class TestFeature(unittest.TestCase):
    def test_something(self):
        # ... test code
        pass
```

### E2E Test with Mock Server

```python
from tests.e2e.mock_server import MockServer

class TestFlow(unittest.TestCase):
    def setUp(self):
        self.server = MockServer()
        self.server.__enter__()
    
    def tearDown(self):
        self.server.__exit__(None, None, None)
```
