using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Files;
using Application.Models;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Scripts;

/// <summary>
/// Creates a script authored in-app: the user picks a name + language and writes
/// the content directly, with no uploaded file. The content is routed through the
/// content-addressed file pipeline using a synthesized file name.
/// </summary>
internal class CreateScriptCommandHandler : ICommandHandler<CreateScriptCommand, CreateScriptResponse>
{
    private readonly IScriptRepository _scriptRepository;
    private readonly IScriptCategoryRepository _scriptCategoryRepository;
    private readonly IFileCreationService _fileCreationService;
    private readonly ISettingRepository _settingRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateScriptCommandHandler(
        IScriptRepository scriptRepository,
        IScriptCategoryRepository scriptCategoryRepository,
        IFileCreationService fileCreationService,
        ISettingRepository settingRepository,
        IDateTimeProvider dateTimeProvider)
    {
        _scriptRepository = scriptRepository;
        _scriptCategoryRepository = scriptCategoryRepository;
        _fileCreationService = fileCreationService;
        _settingRepository = settingRepository;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<CreateScriptResponse>> Handle(CreateScriptCommand command, CancellationToken cancellationToken)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(command.Name))
            {
                return Result.Failure<CreateScriptResponse>(
                    new Error("InvalidInput", "Script name is required."));
            }

            var extension = FileType.GetExtensionForScriptLanguage(command.Language);
            if (extension == null)
            {
                return Result.Failure<CreateScriptResponse>(
                    new Error("InvalidLanguage", $"Unsupported script language '{command.Language}'."));
            }

            // Resolve the name first so it can also seed the synthesized file name.
            var nameResult = await AssetNameService.ResolveNameAsync(
                command.Name, "Script",
                _scriptRepository.ExistsByNameAsync,
                _scriptRepository.GetNamesByPrefixAsync,
                _settingRepository, cancellationToken);
            if (nameResult.IsFailure)
                return Result.Failure<CreateScriptResponse>(nameResult.Error);

            var resolvedName = nameResult.Value;

            if (command.CategoryId.HasValue)
            {
                var category = await _scriptCategoryRepository.GetByIdAsync(command.CategoryId.Value, cancellationToken);
                if (category == null)
                {
                    return Result.Failure<CreateScriptResponse>(
                        new Error("CategoryNotFound", $"Script category with ID {command.CategoryId.Value} was not found."));
                }
            }

            var content = command.Content ?? string.Empty;
            var fileName = $"{SanitizeFileName(resolvedName)}{extension}";

            var fileTypeResult = FileType.ValidateForScriptUpload(fileName);
            if (fileTypeResult.IsFailure)
                return Result.Failure<CreateScriptResponse>(fileTypeResult.Error);

            var upload = new TextFileUpload(fileName, content);
            var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(
                upload, fileTypeResult.Value, cancellationToken);
            if (fileResult.IsFailure)
                return Result.Failure<CreateScriptResponse>(fileResult.Error);

            var file = fileResult.Value;
            var lineCount = ScriptMappings.CountLines(content);

            var script = Script.Create(
                resolvedName,
                file,
                fileTypeResult.Value.Value,
                lineCount,
                file.SizeBytes,
                _dateTimeProvider.UtcNow,
                command.CategoryId,
                command.Description);

            var createdScript = await _scriptRepository.AddAsync(script, cancellationToken);

            return Result.Success(new CreateScriptResponse(
                createdScript.Id,
                createdScript.Name,
                file.Id,
                createdScript.Language,
                file.SizeBytes));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CreateScriptResponse>(
                new Error("CreateScriptFailed", ex.Message));
        }
    }

    // Strips characters that are invalid in file names so the synthesized name is safe.
    private static string SanitizeFileName(string name)
    {
        var invalid = Path.GetInvalidFileNameChars();
        var cleaned = new string(name.Select(c => invalid.Contains(c) ? '_' : c).ToArray()).Trim();
        return string.IsNullOrWhiteSpace(cleaned) ? "script" : cleaned;
    }
}

public record CreateScriptCommand(string Name, string Language, string? Content, int? CategoryId = null, string? Description = null) : ICommand<CreateScriptResponse>;

public record CreateScriptResponse(int ScriptId, string Name, int FileId, string Language, long FileSizeBytes);
