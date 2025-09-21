using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.Abstractions.Storage;
using Domain.Files;
using Domain.Models;
using SharedKernel;

namespace Application.Models
{
    internal class AddModelCommandHandler : ICommandHandler<AddModelCommand, AddModelCommandResponse>
    {
        private readonly IFileStorage _storage;
        private readonly IModelRepository _modelRepository;

        public AddModelCommandHandler(IFileStorage storage, IModelRepository modelRepository)
        {
            _storage = storage;
            _modelRepository = modelRepository;
        }

        public async Task<Result<AddModelCommandResponse>> Handle(AddModelCommand command, CancellationToken cancellationToken)
        {
            var original = Path.GetFileName(command.File.FileName);
            var ext = Path.GetExtension(original) ?? string.Empty;

            var stored = await _storage.SaveAsync(command.File, FileType.Model3D, cancellationToken);

            // Create and persist Model entity to database
            var model = new Model
            {
                FilePath = stored.RelativePath,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            var savedModel = await _modelRepository.AddAsync(model, cancellationToken);

            return Result.Success(new AddModelCommandResponse(savedModel.Id));
        }
    }

    public record AddModelCommand(IFileUpload File) : ICommand<AddModelCommandResponse>;
    public record AddModelCommandResponse(int Id);
}
