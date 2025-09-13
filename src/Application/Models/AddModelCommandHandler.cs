using Application.Abstractions.Messaging;
using SharedKernel;

namespace Application.Models
{
    internal class AddModelCommandHandler : ICommandHandler<AddModelCommand, AddModelCommandResponse>
    {
        public async Task<Result<AddModelCommandResponse>> Handle(AddModelCommand command, CancellationToken cancellationToken)
        {
            var file = command.File;
            var targetPath = Path.Combine(Path.GetTempPath(), file.FileName);

            await using var target = File.Create(targetPath);
            await file.CopyToAsync(target, cancellationToken);

            return Result.Success(new AddModelCommandResponse(1));
        }
    }
}
