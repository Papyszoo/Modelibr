using Application.Abstractions.Messaging;

namespace Application.Models;

public record DeleteModelCommand(int ModelId) : ICommand<DeleteModelResponse>;

public record DeleteModelResponse(int ModelId, bool Success);
