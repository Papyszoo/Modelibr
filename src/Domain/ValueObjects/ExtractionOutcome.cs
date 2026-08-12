namespace Domain.ValueObjects;

/// <summary>
/// Whether an extraction produced a full result, a usable-but-incomplete result,
/// or nothing. Partial success is valid: a file that imports with warnings is
/// still worth indexing (see the extraction-substrate prompt).
/// </summary>
public enum ExtractionOutcome
{
    /// <summary>Every applicable field was extracted without warnings.</summary>
    Complete = 0,

    /// <summary>Usable result, but some fields were skipped or produced warnings.</summary>
    Partial = 1,

    /// <summary>Extraction failed; the payload (if any) is not trustworthy.</summary>
    Failed = 2
}
