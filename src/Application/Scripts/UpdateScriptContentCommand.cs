using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Files;
using Application.Services;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Scripts;

internal class UpdateScriptContentCommandHandler : ICommandHandler<UpdateScriptContentCommand, UpdateScriptContentResponse>
{
    private readonly IScriptRepository _scriptRepository;
    private readonly IFileCreationService _fileCreationService;
    private readonly IDateTimeProvider _dateTimeProvider;

    public UpdateScriptContentCommandHandler(
        IScriptRepository scriptRepository,
        IFileCreationService fileCreationService,
        IDateTimeProvider dateTimeProvider)
    {
        _scriptRepository = scriptRepository;
        _fileCreationService = fileCreationService;
        _dateTimeProvider = dateTimeProvider;
    }

    public async Task<Result<UpdateScriptContentResponse>> Handle(UpdateScriptContentCommand command, CancellationToken cancellationToken)
    {
        try
        {
            var script = await _scriptRepository.GetByIdAsync(command.Id, cancellationToken);
            if (script == null)
            {
                return Result.Failure<UpdateScriptContentResponse>(
                    new Error("ScriptNotFound", $"Script with ID {command.Id} not found."));
            }

            // Preserve the original file name so the extension (and therefore the
            // language/type) stays stable across edits.
            var fileName = script.File?.OriginalFileName ?? $"{script.Name}.txt";

            var fileTypeResult = FileType.ValidateForScriptUpload(fileName);
            if (fileTypeResult.IsFailure)
            {
                return Result.Failure<UpdateScriptContentResponse>(fileTypeResult.Error);
            }

            // Content-addressed storage: saving produces a new file (or reuses an
            // identical one) which the script is then re-pointed at.
            var upload = new TextFileUpload(fileName, command.Content);
            var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(
                upload, fileTypeResult.Value, cancellationToken);
            if (fileResult.IsFailure)
            {
                return Result.Failure<UpdateScriptContentResponse>(fileResult.Error);
            }

            var file = fileResult.Value;
            var lineCount = ScriptMappings.CountLines(command.Content);

            script.UpdateContent(file, lineCount, file.SizeBytes, _dateTimeProvider.UtcNow);
            var savedScript = await _scriptRepository.UpdateAsync(script, cancellationToken);

            return Result.Success(new UpdateScriptContentResponse(
                savedScript.Id, file.Id, savedScript.LineCount, file.SizeBytes));
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<UpdateScriptContentResponse>(
                new Error("ScriptContentUpdateFailed", ex.Message));
        }
    }
}

public record UpdateScriptContentCommand(int Id, string Content) : ICommand<UpdateScriptContentResponse>;
public record UpdateScriptContentResponse(int Id, int FileId, int LineCount, long FileSizeBytes);
