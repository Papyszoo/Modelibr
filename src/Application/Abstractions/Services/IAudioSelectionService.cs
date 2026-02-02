namespace Application.Abstractions.Services;

/// <summary>
/// Service for managing the active audio selection state for a single user.
/// This is used by the WebDAV virtual file system to provide trimmed audio snippets.
/// </summary>
public interface IAudioSelectionService
{
    /// <summary>
    /// Gets the current audio selection.
    /// </summary>
    AudioSelection? GetSelection();

    /// <summary>
    /// Sets the audio selection state.
    /// </summary>
    void SetSelection(int fileId, string fileName, double startTime, double endTime);

    /// <summary>
    /// Clears the current audio selection.
    /// </summary>
    void ClearSelection();
}

/// <summary>
/// Represents an active audio selection with start and end times.
/// </summary>
public record AudioSelection(
    int FileId,
    string FileName,
    double StartTime,
    double EndTime)
{
    /// <summary>
    /// Gets the duration of the selection in seconds.
    /// </summary>
    public double Duration => EndTime - StartTime;
}
