import logger from '../logger.js'

/**
 * Aggregates classification results from multiple images
 */
export class TagAggregator {
  /**
   * Aggregate predictions from multiple images into deduplicated tags and description
   * @param {Array<Array<{className: string, probability: number}>>} allPredictions - Array of predictions per image
   * @param {Object} options - Aggregation options
   * @param {number} options.minConfidence - Minimum confidence threshold (0-1)
   * @param {number} options.maxTags - Maximum number of tags to return
   * @returns {Object} - {tags: string, description: string}
   */
  static aggregateTags(
    allPredictions,
    { minConfidence = 0.1, maxTags = 10 } = {}
  ) {
    // Flatten all predictions
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

    // Group by className and calculate average confidence
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

    // Calculate average confidence for each tag
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

    // Sort by probability (descending) and limit to maxTags
    aggregatedTags.sort((a, b) => b.probability - a.probability)
    const topTags = aggregatedTags.slice(0, maxTags)

    // Format tags as comma-separated string (simple, searchable)
    const tagsString = topTags.map(tag => tag.className).join(', ')

    // Generate description with percentages and occurrences
    const description = topTags
      .map(
        tag =>
          `${tag.className} (${(tag.probability * 100).toFixed(1)}%, ${tag.occurrences}x)`
      )
      .join(', ')

    logger.info('Tags aggregated successfully', {
      totalPredictions: allTags.length,
      uniqueTags: tagMap.size,
      finalTags: topTags.length,
      topTag: topTags[0]?.className,
    })

    return {
      tags: tagsString,
      description,
    }
  }
}
