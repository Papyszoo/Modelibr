using Application.Abstractions.Messaging;
using SharedKernel;

namespace Application.Models
{
    internal class AddModelCommandHandler : ICommandHandler<AddModelCommand, AddModelCommandResponse>
    {
        public async Task<Result<AddModelCommandResponse>> Handle(AddModelCommand command, CancellationToken cancellationToken)
        {
            using (var fileStream = File.Create(""))
            {
                command.FileStream.Seek(0, SeekOrigin.Begin);
                await command.FileStream.CopyToAsync(fileStream, cancellationToken);
            };
            
            return Result.Success(new AddModelCommandResponse(1));
        }
    }
}
