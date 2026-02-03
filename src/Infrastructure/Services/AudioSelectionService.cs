using Application.Abstractions.Services;

namespace Infrastructure.Services;

/// <summary>
/// In-memory implementation of audio selection service.
/// Holds the single-user "Active Selection" state for audio snippets.
/// </summary>
public sealed class AudioSelectionService : IAudioSelectionService
{
    private AudioSelection? _currentSelection;
    private readonly object _lock = new();

    public AudioSelection? GetSelection()
    {
        lock (_lock)
        {
            return _currentSelection;
        }
    }

    public void SetSelection(int fileId, string fileName, double startTime, double endTime)
    {
        if (endTime <= startTime)
        {
            throw new ArgumentException("End time must be greater than start time");
        }

        if (startTime < 0)
        {
            throw new ArgumentException("Start time cannot be negative");
        }

        lock (_lock)
        {
            _currentSelection = new AudioSelection(fileId, fileName, startTime, endTime);
        }
    }

    public void ClearSelection()
    {
        lock (_lock)
        {
            _currentSelection = null;
        }
    }
}
