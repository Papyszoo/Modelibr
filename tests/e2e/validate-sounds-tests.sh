#!/bin/bash
# Validation script for Sounds E2E tests

echo "🔍 Validating Sounds E2E Test Implementation..."
echo ""

# Check if files exist
FILES=(
    "assets/test-tone.wav"
    "steps/sounds.steps.ts"
    "features/09-sounds/01-setup.feature"
    "features/09-sounds/02-sound-crud.feature"
    "features/09-sounds/03-categories.feature"
    "features/09-sounds/README.md"
    "fixtures/shared-state.ts"
)

echo "📁 Checking files..."
MISSING=0
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "  ✅ $file"
    else
        echo "  ❌ $file (MISSING)"
        MISSING=1
    fi
done
echo ""

# Check shared-state.ts has Sound types
echo "🔧 Checking shared-state.ts for Sound types..."
if grep -q "interface SoundData" fixtures/shared-state.ts; then
    echo "  ✅ SoundData interface found"
else
    echo "  ❌ SoundData interface missing"
    MISSING=1
fi

if grep -q "interface SoundCategoryData" fixtures/shared-state.ts; then
    echo "  ✅ SoundCategoryData interface found"
else
    echo "  ❌ SoundCategoryData interface missing"
    MISSING=1
fi

if grep -q "saveSound" fixtures/shared-state.ts; then
    echo "  ✅ saveSound method found"
else
    echo "  ❌ saveSound method missing"
    MISSING=1
fi

if grep -q "saveSoundCategory" fixtures/shared-state.ts; then
    echo "  ✅ saveSoundCategory method found"
else
    echo "  ❌ saveSoundCategory method missing"
    MISSING=1
fi
echo ""

# Check generated test files
echo "📝 Checking generated test files..."
if [ -d ".features-gen/features/09-sounds" ]; then
    echo "  ✅ Generated sounds test directory exists"
    COUNT=$(ls -1 .features-gen/features/09-sounds/*.spec.js 2>/dev/null | wc -l)
    echo "  ✅ Found $COUNT generated test files"
else
    echo "  ❌ Generated test directory missing (run 'npm run bdd')"
    MISSING=1
fi
echo ""

# Check test audio file
echo "🎵 Checking test audio file..."
if [ -f "assets/test-tone.wav" ]; then
    SIZE=$(stat -f%z "assets/test-tone.wav" 2>/dev/null || stat -c%s "assets/test-tone.wav" 2>/dev/null)
    if [ "$SIZE" -gt 10000 ]; then
        echo "  ✅ test-tone.wav exists and is valid (${SIZE} bytes)"
    else
        echo "  ⚠️  test-tone.wav seems too small (${SIZE} bytes)"
    fi
else
    echo "  ❌ test-tone.wav missing"
    MISSING=1
fi
echo ""

# Summary
if [ $MISSING -eq 0 ]; then
    echo "✅ All validations passed! Sounds E2E tests are ready."
    echo ""
    echo "To run the tests:"
    echo "  npm run test:e2e -- --grep '@sounds'"
    exit 0
else
    echo "❌ Some validations failed. Please review the output above."
    exit 1
fi
