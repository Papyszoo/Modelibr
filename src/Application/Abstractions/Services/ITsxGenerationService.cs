namespace Application.Abstractions.Services;

public interface ITsxGenerationService
{
    /// <summary>
    /// Generates TypeScript/TSX code from stage configuration JSON.
    /// </summary>
    /// <param name="stageName">Name of the stage (used for component name)</param>
    /// <param name="configurationJson">JSON configuration of the stage</param>
    /// <returns>Generated TSX file content</returns>
    string GenerateTsxCode(string stageName, string configurationJson);
}
