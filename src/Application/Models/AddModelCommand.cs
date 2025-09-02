using Application.Abstractions.Messaging;

namespace Application.Models
{
    public record AddModelCommand(FileStream Model) : ICommand<AddModelCommandResponse>;

    public record AddModelCommandResponse(int Id);
}
