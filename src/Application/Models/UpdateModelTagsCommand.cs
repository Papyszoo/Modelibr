using Application.Abstractions.Messaging;

namespace Application.Models;

public record UpdateModelTagsCommand(
    int ModelId,
    string? Tags,
    string? Description
) : ICommand<UpdateModelTagsResponse>;

public record UpdateModelTagsResponse(
    int ModelId,
    string? Tags,
    string? Description
);
