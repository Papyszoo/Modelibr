using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Services;
using Domain.Services;
using Domain.ValueObjects;
using SharedKernel;

namespace Application.Models
{
    internal class AddFileToModelCommandHandler : ICommandHandler<AddFileToModelCommand, AddFileToModelCommandResponse>
    {
        private readonly IModelRepository _modelRepository;
        private readonly IFileCreationService _fileCreationService;
        private readonly IDateTimeProvider _dateTimeProvider;

        public AddFileToModelCommandHandler(
            IModelRepository modelRepository, 
            IFileCreationService fileCreationService,
            IDateTimeProvider dateTimeProvider)
        {
            _modelRepository = modelRepository;
            _fileCreationService = fileCreationService;
            _dateTimeProvider = dateTimeProvider;
        }

        public async Task<Result<AddFileToModelCommandResponse>> Handle(AddFileToModelCommand command, CancellationToken cancellationToken)
        {
            // Validate file type for upload using Value Object directly
            var fileTypeResult = FileType.ValidateForUpload(command.File.FileName);
            if (fileTypeResult.IsFailure)
            {
                return Result.Failure<AddFileToModelCommandResponse>(fileTypeResult.Error);
            }

            // Create or get existing file
            var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(
                command.File, 
                fileTypeResult.Value, 
                cancellationToken);

            if (fileResult.IsFailure)
            {
                return Result.Failure<AddFileToModelCommandResponse>(fileResult.Error);
            }

            var fileEntity = fileResult.Value;

            // Check if file is already linked to this model
            if (fileEntity.IsLinkedToModel(command.ModelId))
            {
                return Result.Success(new AddFileToModelCommandResponse(fileEntity.Id, true));
            }

            try
            {
                var model = await _modelRepository.GetByIdAsync(command.ModelId, cancellationToken);
                if (model == null)
                {
                    return Result.Failure<AddFileToModelCommandResponse>(new Error("ModelNotFound", $"Model with ID {command.ModelId} was not found."));
                }

                if (model.ActiveVersion == null)
                {
                    return Result.Failure<AddFileToModelCommandResponse>(new Error("NoActiveVersion", $"Model {command.ModelId} has no active version."));
                }

                // Add file to the active version
                fileEntity.SetModelVersion(model.ActiveVersion.Id);
                model.ActiveVersion.AddFile(fileEntity);
                
                await _modelRepository.UpdateAsync(model, cancellationToken);
                return Result.Success(new AddFileToModelCommandResponse(fileEntity.Id, false));
            }
            catch (ArgumentException ex)
            {
                return Result.Failure<AddFileToModelCommandResponse>(new Error("ModelNotFound", ex.Message));
            }
        }
    }

    public record AddFileToModelCommand(int ModelId, IFileUpload File) : ICommand<AddFileToModelCommandResponse>;
    public record AddFileToModelCommandResponse(int FileId, bool AlreadyLinked = false);
}