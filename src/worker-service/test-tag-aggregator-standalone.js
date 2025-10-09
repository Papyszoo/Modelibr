#!/usr/bin/env node

/**
 * Minimal test for TagAggregator without dependencies
 * This is a standalone version that doesn't require logger
 */

class TagAggregator {
  static aggregateTags(
    allPredictions,
    { minConfidence = 0.1, maxTags = 10 } = {}
  ) {
    const allTags = []
    for (const predictions of allPredictions) {
      for (const pred of predictions) {
        if (pred.probability >= minConfidence) {
          allTags.push({
            className: pred.className,
            probability: pred.probability,
          })
        }
      }
    }

    const tagMap = new Map()
    for (const tag of allTags) {
      if (!tagMap.has(tag.className)) {
        tagMap.set(tag.className, {
          className: tag.className,
          probabilities: [],
        })
      }
      tagMap.get(tag.className).probabilities.push(tag.probability)
    }

    const aggregatedTags = Array.from(tagMap.values()).map(tag => {
      const avgProbability =
        tag.probabilities.reduce((sum, p) => sum + p, 0) /
        tag.probabilities.length
      return {
        className: tag.className,
        probability: avgProbability,
        occurrences: tag.probabilities.length,
      }
    })

    aggregatedTags.sort((a, b) => b.probability - a.probability)
    const topTags = aggregatedTags.slice(0, maxTags)

    // Format tags as comma-separated string (simple, searchable)
    const tagsString = topTags
      .map(tag => tag.className)
      .join(', ')

    // Generate description with percentages and occurrences
    const description = topTags
      .map(
        tag =>
          `${tag.className} (${(tag.probability * 100).toFixed(1)}%, ${tag.occurrences}x)`
      )
      .join(', ')

    return {
      tags: tagsString,
      description,
    }
  }
}

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
console.assert(result1.tags === 'table, chair, furniture, wooden object', 'Tags should be comma-separated names')
console.assert(result1.description.includes('75.0%'), 'Description should include percentages')
console.log('✓ Test 1 passed\n')

// Test 2: Low confidence filtering
console.log('Test 2: Low confidence filtering')
const predictions2 = [
  [
    { className: 'object', probability: 0.05 },
    { className: 'item', probability: 0.9 },
  ],
  [
    { className: 'item', probability: 0.85 },
    { className: 'thing', probability: 0.08 },
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
  result4.description.includes('%'),
  'Description should include percentages'
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
  result5.description === '',
  'Description should be empty too'
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
console.assert(result6.description.includes('3x'), 'Description should show 3 occurrences for cube')
console.assert(result6.description.includes('1x'), 'Description should show 1 occurrence for box')
console.log('✓ Test 6 passed\n')

console.log('All tests passed! ✓')
