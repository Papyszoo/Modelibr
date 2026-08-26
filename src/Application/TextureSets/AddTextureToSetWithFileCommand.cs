using Application.Abstractions;
using Application.Abstractions.Files;
using Application.Abstractions.Repositories;
using Application.Abstractions.Messaging;
using Application.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.TextureSets;

/// <summary>
/// Adds a channel to an existing texture set from an <b>uploaded file</b>, rather than
/// from a file id that must already exist.
///
/// The gap this closes: <see cref="CreateTextureSetWithFileCommand"/> can upload the
/// first channel, but every channel after it went through
/// <see cref="AddTextureToTextureSetCommand"/>, which takes a <c>FileId</c> - so the file
/// had to have entered the system some other way first. The UI's add-channel dialog only
/// ever picks an already-uploaded file, so no path existed to bring a fresh normal or
/// roughness map into a set in one step. That is why a 51-material ambientCG corpus could
/// not be imported: a material is 4-6 channel files, and only the first had a home.
///
/// Uploads, then delegates to <see cref="AddTextureToTextureSetCommand"/> rather than
/// duplicating it - the replace-existing-type rule, the image-metadata capture and the
/// thumbnail enqueue all stay in one place.
/// </summary>
internal class AddTextureToSetWithFileCommandHandler
    : ICommandHandler<AddTextureToSetWithFileCommand, AddTextureToTextureSetResponse>
{
    private readonly IFileCreationService _fileCreationService;
    private readonly IFileRepository _fileRepository;
    private readonly ICommandHandler<AddTextureToTextureSetCommand, AddTextureToTextureSetResponse> _addTexture;
    private readonly IUnitOfWork _unitOfWork;

    public AddTextureToSetWithFileCommandHandler(
        IFileCreationService fileCreationService,
        IFileRepository fileRepository,
        ICommandHandler<AddTextureToTextureSetCommand, AddTextureToTextureSetResponse> addTexture,
        IUnitOfWork unitOfWork)
    {
        _fileCreationService = fileCreationService;
        _fileRepository = fileRepository;
        _addTexture = addTexture;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<AddTextureToTextureSetResponse>> Handle(
        AddTextureToSetWithFileCommand command,
        CancellationToken cancellationToken)
    {
        var fileTypeResult = FileType.ValidateForUpload(command.FileUpload.FileName);
        if (fileTypeResult.IsFailure)
        {
            return Result.Failure<AddTextureToTextureSetResponse>(fileTypeResult.Error);
        }

        // Content-addressed: re-uploading the same bytes returns the existing file, so a
        // retried channel import does not duplicate storage.
        var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(
            command.FileUpload,
            fileTypeResult.Value,
            cancellationToken);

        if (fileResult.IsFailure)
        {
            return Result.Failure<AddTextureToTextureSetResponse>(fileResult.Error);
        }

        var file = fileResult.Value;

        // A brand-new file comes back DETACHED with id 0 - the creation service writes the
        // bytes and builds the entity, and every other caller attaches it through the
        // aggregate that references it. The delegate below resolves the file by id from the
        // database, so it has to be staged and committed first or it fails with FileNotFound
        // on a file that was just uploaded. A deduped upload is already persisted and keeps
        // its id, so this only fires for genuinely new bytes.
        if (file.Id == 0)
        {
            await _fileRepository.AddAsync(file, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }

        return await _addTexture.Handle(
            new AddTextureToTextureSetCommand(
                command.TextureSetId,
                fileResult.Value.Id,
                command.TextureType,
                command.SourceChannel),
            cancellationToken);
    }
}

public record AddTextureToSetWithFileCommand(
    int TextureSetId,
    IFileUpload FileUpload,
    TextureType TextureType,
    TextureChannel? SourceChannel = null) : ICommand<AddTextureToTextureSetResponse>;
