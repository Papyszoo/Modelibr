using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Models;
using Application.Services;
using Domain.Models;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Scripts;

internal class CreateScriptWithFileCommandHandler : ICommandHandler<CreateScriptWithFileCommand, CreateScriptWithFileResponse>
{
    private readonly IScriptRepository _scriptRepository;
    private readonly IScriptCategoryRepository _scriptCategoryRepository;
    private readonly IFileCreationService _fileCreationService;
    private readonly ISettingRepository _settingRepository;
    private readonly IDateTimeProvider _dateTimeProvider;

    public CreateScriptWithFileCommandHandler(
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

    public async Task<Result<CreateScriptWithFileResponse>> Handle(CreateScriptWithFileCommand command, CancellationToken cancellationToken)
    {
        try
        {
            // 1. Validate and resolve the script's source-code file type / language
            var fileTypeResult = FileType.ValidateForScriptUpload(command.FileUpload.FileName);
            if (fileTypeResult.IsFailure)
            {
                return Result.Failure<CreateScriptWithFileResponse>(fileTypeResult.Error);
            }

            var language = fileTypeResult.Value.Value;

            // 2. Count lines from the raw content before it is consumed by storage
            int lineCount;
            using (var reader = new StreamReader(command.FileUpload.OpenRead()))
            {
                lineCount = ScriptMappings.CountLines(await reader.ReadToEndAsync(cancellationToken));
            }

            // 3. Upload the file (or get existing if duplicate content)
            var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(
                command.FileUpload,
                fileTypeResult.Value,
                cancellationToken);

            if (fileResult.IsFailure)
            {
                return Result.Failure<CreateScriptWithFileResponse>(fileResult.Error);
            }

            var file = fileResult.Value;

            // 4. Reuse an existing script if one already wraps this exact content
            var existingScript = await _scriptRepository.GetByFileHashAsync(file.Sha256Hash, cancellationToken);
            if (existingScript != null)
            {
                return Result.Success(new CreateScriptWithFileResponse(
                    existingScript.Id,
                    existingScript.Name,
                    file.Id,
                    existingScript.Language,
                    file.SizeBytes));
            }

            if (command.CategoryId.HasValue)
            {
                var category = await _scriptCategoryRepository.GetByIdAsync(command.CategoryId.Value, cancellationToken);
                if (category == null)
                {
                    return Result.Failure<CreateScriptWithFileResponse>(
                        new Error("CategoryNotFound", $"Script category with ID {command.CategoryId.Value} was not found."));
                }
            }

            // 5. Resolve name collision based on DuplicateNamePolicy setting
            var nameResult = await AssetNameService.ResolveNameAsync(
                command.Name, "Script",
                _scriptRepository.ExistsByNameAsync,
                _scriptRepository.GetNamesByPrefixAsync,
                _settingRepository, cancellationToken);
            if (nameResult.IsFailure)
                return Result.Failure<CreateScriptWithFileResponse>(nameResult.Error);

            // 6. Create the script
            var script = Script.Create(
                nameResult.Value,
                file,
                language,
                lineCount,
                file.SizeBytes,
                _dateTimeProvider.UtcNow,
                command.CategoryId);

            var createdScript = await _scriptRepository.AddAsync(script, cancellationToken);

            return Result.Success(new CreateScriptWithFileResponse(
                createdScript.Id,
                createdScript.Name,
                file.Id,
                createdScript.Language,
                file.SizeBytes));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<CreateScriptWithFileResponse>(
                new Error("CreateScriptWithFileFailed", ex.Message));
        }
        catch (InvalidOperationException ex)
        {
            return Result.Failure<CreateScriptWithFileResponse>(
                new Error("BusinessRuleViolation", ex.Message));
        }
    }
}

public record CreateScriptWithFileCommand(
    IFileUpload FileUpload,
    string Name,
    int? CategoryId) : ICommand<CreateScriptWithFileResponse>;

public record CreateScriptWithFileResponse(
    int ScriptId,
    string Name,
    int FileId,
    string Language,
    long FileSizeBytes);
