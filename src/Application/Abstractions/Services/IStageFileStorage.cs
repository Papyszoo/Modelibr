namespace Application.Abstractions.Services;

public interface IStageFileStorage
{
    /// <summary>
    /// Saves a TSX file for a stage.
    /// </summary>
    /// <param name="stageName">Name of the stage (used for file naming)</param>
    /// <param name="tsxContent">TSX file content</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>Relative path to the saved file</returns>
    Task<string> SaveTsxFileAsync(string stageName, string tsxContent, CancellationToken cancellationToken = default);

    /// <summary>
    /// Retrieves TSX file content for a stage.
    /// </summary>
    /// <param name="filePath">Relative path to the TSX file</param>
    /// <param name="cancellationToken">Cancellation token</param>
    /// <returns>TSX file content</returns>
    Task<string> GetTsxFileAsync(string filePath, CancellationToken cancellationToken = default);

    /// <summary>
    /// Checks if a TSX file exists.
    /// </summary>
    /// <param name="filePath">Relative path to the TSX file</param>
    /// <returns>True if file exists, false otherwise</returns>
    bool TsxFileExists(string filePath);

    /// <summary>
    /// Deletes a TSX file.
    /// </summary>
    /// <param name="filePath">Relative path to the TSX file</param>
    /// <param name="cancellationToken">Cancellation token</param>
    Task DeleteTsxFileAsync(string filePath, CancellationToken cancellationToken = default);
}
