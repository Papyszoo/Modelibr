using Application.Abstractions.Messaging;

namespace Application.Models;

public record UpdateModelTagsCommand(
    int ModelId,
    IReadOnlyCollection<string>? Tags,
    string? Description,
    int? CategoryId
) : ICommand<UpdateModelTagsResponse>;

public record UpdateModelTagsResponse(
    int ModelId,
    IReadOnlyList<string> Tags,
    string? Description,
    int? CategoryId
);
