#!/usr/bin/env node
import { TagAggregator } from './imageTagger/tagAggregator.js'

/**
 * Simple test runner for TagAggregator
 * Run with: node test-tag-aggregator.js
 */

// Test 1: Basic aggregation
console.log('Test 1: Basic tag aggregation')
const predictions1 = [
  [
    { className: 'table', probability: 0.8 },
    { className: 'chair', probability: 0.6 },
  ],
  [
    { className: 'table', probability: 0.7 },
    { className: 'furniture', probability: 0.5 },
  ],
  [
    { className: 'table', probability: 0.75 },
    { className: 'wooden object', probability: 0.4 },
  ],
]

const result1 = TagAggregator.aggregateTags(predictions1, {
  minConfidence: 0.3,
  maxTags: 5,
})

console.log('Result:', result1)
console.assert(result1.tags.includes('table'), 'Should include "table" tag')
console.assert(
  result1.description.includes('table'),
  'Description should include "table"'
)
console.log('✓ Test 1 passed\n')

// Test 2: Low confidence filtering
console.log('Test 2: Low confidence filtering')
const predictions2 = [
  [
    { className: 'object', probability: 0.05 }, // Below threshold
    { className: 'item', probability: 0.9 },
  ],
  [
    { className: 'item', probability: 0.85 },
    { className: 'thing', probability: 0.08 }, // Below threshold
  ],
]

const result2 = TagAggregator.aggregateTags(predictions2, {
  minConfidence: 0.1,
  maxTags: 5,
})

console.log('Result:', result2)
console.assert(!result2.tags.includes('object'), 'Should filter out "object"')
console.assert(!result2.tags.includes('thing'), 'Should filter out "thing"')
console.assert(result2.tags.includes('item'), 'Should include "item"')
console.log('✓ Test 2 passed\n')

// Test 3: Max tags limit
console.log('Test 3: Max tags limit')
const predictions3 = [
  [
    { className: 'tag1', probability: 0.9 },
    { className: 'tag2', probability: 0.8 },
    { className: 'tag3', probability: 0.7 },
  ],
  [
    { className: 'tag4', probability: 0.6 },
    { className: 'tag5', probability: 0.5 },
    { className: 'tag6', probability: 0.4 },
  ],
]

const result3 = TagAggregator.aggregateTags(predictions3, {
  minConfidence: 0.1,
  maxTags: 3,
})

console.log('Result:', result3)
const tagCount = result3.tags.split(',').length
console.assert(tagCount <= 3, `Should have at most 3 tags, got ${tagCount}`)
console.log('✓ Test 3 passed\n')

// Test 4: Description generation
console.log('Test 4: Description generation')
const predictions4 = [
  [
    { className: 'vehicle', probability: 0.9 },
    { className: 'automobile', probability: 0.8 },
    { className: 'sports car', probability: 0.7 },
  ],
]

const result4 = TagAggregator.aggregateTags(predictions4, {
  minConfidence: 0.1,
  maxTags: 10,
})

console.log('Result:', result4)
console.assert(
  result4.description.startsWith('Contains'),
  'Description should start with "Contains"'
)
console.log('✓ Test 4 passed\n')

// Test 5: Empty predictions
console.log('Test 5: Empty predictions handling')
const predictions5 = [[]]

const result5 = TagAggregator.aggregateTags(predictions5, {
  minConfidence: 0.1,
  maxTags: 10,
})

console.log('Result:', result5)
console.assert(result5.tags === '', 'Tags should be empty')
console.assert(
  result5.description === 'No description available',
  'Should have default description'
)
console.log('✓ Test 5 passed\n')

// Test 6: Duplicate aggregation with occurrence count
console.log('Test 6: Duplicate aggregation with occurrence count')
const predictions6 = [
  [{ className: 'cube', probability: 0.8 }],
  [{ className: 'cube', probability: 0.85 }],
  [{ className: 'cube', probability: 0.9 }],
  [{ className: 'box', probability: 0.7 }],
]

const result6 = TagAggregator.aggregateTags(predictions6, {
  minConfidence: 0.1,
  maxTags: 10,
})

console.log('Result:', result6)
console.assert(result6.tags.includes('3x'), 'Should show 3 occurrences for cube')
console.assert(result6.tags.includes('1x'), 'Should show 1 occurrence for box')
console.log('✓ Test 6 passed\n')

console.log('All tests passed! ✓')
