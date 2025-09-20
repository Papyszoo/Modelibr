using Application.Abstractions.Files;
using Application.Abstractions.Messaging;
using Application.Abstractions.Storage;
using Domain.Files;
using SharedKernel;

namespace Application.Models
{
    internal class AddModelCommandHandler : ICommandHandler<AddModelCommand, AddModelCommandResponse>
    {
        private readonly IFileStorage _storage;

        public AddModelCommandHandler(IFileStorage storage)
        {
            _storage = storage;
        }

        public async Task<Result<AddModelCommandResponse>> Handle(AddModelCommand command, CancellationToken cancellationToken)
        {
            var original = Path.GetFileName(command.File.FileName);
            var ext = Path.GetExtension(original) ?? string.Empty;

            var stored = await _storage.SaveAsync(command.File, FileType.Model3D, cancellationToken);

            // TODO: persist StoredFile entity with metadata:
            // stored.RelativePath, stored.StoredName, stored.Sha256, stored.SizeBytes,
            // original, ext, mime (command.File.ContentType?), FileType.Model3D

            return Result.Success(new AddModelCommandResponse(1));
        }
    }

    public record AddModelCommand(IFileUpload File) : ICommand<AddModelCommandResponse>;
    public record AddModelCommandResponse(int Id);
}
