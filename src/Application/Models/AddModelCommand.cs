using Application.Abstractions.Files;
using Application.Abstractions.Messaging;

namespace Application.Models
{
    public record AddModelCommand(IFileUpload File) : ICommand<AddModelCommandResponse>;

    public record AddModelCommandResponse(int Id);
}
