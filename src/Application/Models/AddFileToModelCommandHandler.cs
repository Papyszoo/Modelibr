using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Services;
using Domain.Services;
using SharedKernel;

namespace Application.Models
{
    internal class AddFileToModelCommandHandler : ICommandHandler<AddFileToModelCommand, AddFileToModelCommandResponse>
    {
        private readonly IModelRepository _modelRepository;
        private readonly IFileCreationService _fileCreationService;
        private readonly IFileProcessingService _fileProcessingService;
        private readonly IDateTimeProvider _dateTimeProvider;

        public AddFileToModelCommandHandler(
            IModelRepository modelRepository, 
            IFileCreationService fileCreationService,
            IFileProcessingService fileProcessingService,
            IDateTimeProvider dateTimeProvider)
        {
            _modelRepository = modelRepository;
            _fileCreationService = fileCreationService;
            _fileProcessingService = fileProcessingService;
            _dateTimeProvider = dateTimeProvider;
        }

        public async Task<Result<AddFileToModelCommandResponse>> Handle(AddFileToModelCommand command, CancellationToken cancellationToken)
        {
            // Validate file type for upload
            var fileTypeResult = _fileProcessingService.ValidateFileForUpload(command.File.FileName);
            if (!fileTypeResult.IsSuccess)
            {
                return Result.Failure<AddFileToModelCommandResponse>(fileTypeResult.Error);
            }

            // Create or get existing file
            var fileResult = await _fileCreationService.CreateOrGetExistingFileAsync(
                command.File, 
                fileTypeResult.Value, 
                cancellationToken);

            if (!fileResult.IsSuccess)
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
                await _modelRepository.AddFileAsync(command.ModelId, fileEntity, cancellationToken);
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