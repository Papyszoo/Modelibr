using Application.Abstractions;
using SharedKernel;

namespace Application.Abstractions.Messaging;

/// <summary>
/// Structural safety net for the unit-of-work migration (prompt 25): wraps
/// every registered <see cref="ICommandHandler{TCommand}"/> so that, once the
/// inner handler returns a SUCCESS <see cref="Result"/>, any changes it staged
/// on the shared ApplicationDbContext are committed via
/// <see cref="IUnitOfWork.SaveChangesAsync"/> - even if the handler itself
/// forgot to call it, or only called it on a conditional branch that this
/// particular request didn't take (both regression classes hit in
/// production/CI: a handler with no commit at all, and a handler whose only
/// commit lived inside an `if`). On a failure <see cref="Result"/>, or if the
/// handler throws, nothing is committed here - staged-but-unpersisted changes
/// are simply dropped with the scoped DbContext, which is the correct
/// behavior: a failed command should not leave partial writes durable.
///
/// This is a backstop, not a replacement for explicit commits: a handler that
/// needs a database-assigned id mid-method (e.g. to materialize a foreign key
/// before creating a dependent entity, or because EF can't have two related
/// aggregates both still `Added` in the same SaveChanges - see
/// AddModelCommandHandler) must keep its own explicit
/// IUnitOfWork.SaveChangesAsync calls at those points. This decorator's
/// trailing SaveChangesAsync after such a handler is a harmless no-op flush
/// (nothing new staged since the handler's own last commit).
///
/// Registered for both command handler arities in
/// <see cref="Application.DependencyInjection"/>. Deliberately NOT applied to
/// <see cref="IQueryHandler{TQuery,TResponse}"/> - a query that writes (see
/// GetSettingsQueryHandler's get-or-create-defaults) commits explicitly
/// instead, since making an ostensibly read-only pipeline commit by default
/// would mask side effects that query handlers must otherwise never have.
/// </summary>
internal sealed class CommandHandlerUnitOfWorkDecorator<TCommand> : ICommandHandler<TCommand>
    where TCommand : ICommand
{
    private readonly ICommandHandler<TCommand> _inner;
    private readonly IUnitOfWork _unitOfWork;

    public CommandHandlerUnitOfWorkDecorator(ICommandHandler<TCommand> inner, IUnitOfWork unitOfWork)
    {
        _inner = inner;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result> Handle(TCommand command, CancellationToken cancellationToken)
    {
        var result = await _inner.Handle(command, cancellationToken);

        if (result.IsSuccess)
        {
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }

        return result;
    }
}

/// <summary>
/// The <see cref="ICommandHandler{TCommand,TResponse}"/> counterpart of
/// <see cref="CommandHandlerUnitOfWorkDecorator{TCommand}"/> - see that type's
/// doc comment for the full rationale.
/// </summary>
internal sealed class CommandHandlerUnitOfWorkDecorator<TCommand, TResponse> : ICommandHandler<TCommand, TResponse>
    where TCommand : ICommand<TResponse>
{
    private readonly ICommandHandler<TCommand, TResponse> _inner;
    private readonly IUnitOfWork _unitOfWork;

    public CommandHandlerUnitOfWorkDecorator(ICommandHandler<TCommand, TResponse> inner, IUnitOfWork unitOfWork)
    {
        _inner = inner;
        _unitOfWork = unitOfWork;
    }

    public async Task<Result<TResponse>> Handle(TCommand command, CancellationToken cancellationToken)
    {
        var result = await _inner.Handle(command, cancellationToken);

        if (result.IsSuccess)
        {
            await _unitOfWork.SaveChangesAsync(cancellationToken);
        }

        return result;
    }
}
