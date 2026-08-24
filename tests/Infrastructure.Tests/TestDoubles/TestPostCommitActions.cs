using Application.Abstractions;

namespace Infrastructure.Tests.TestDoubles;

/// <summary>
/// A post-commit queue a unit test drives by hand.
/// </summary>
/// <remarks>
/// <para>
/// The real drain happens at the outermost <see cref="IUnitOfWork"/> boundary. Point a
/// mocked unit of work at <see cref="RunPendingAsync"/> and the double reproduces the
/// no-ambient-transaction case exactly: the save commits, then the effects fire. Leave it
/// undriven and the effects never fire, which is the case a handler running inside an outer
/// transaction is in - and the assertion with teeth in it.
/// </para>
/// <para>
/// <see cref="Enqueued"/> and <see cref="Ran"/> are separate on purpose. A side effect that
/// was registered and a side effect that happened are the whole distinction under test.
/// </para>
/// </remarks>
internal sealed class TestPostCommitActions : IPostCommitActions
{
    private readonly List<(string Description, Func<CancellationToken, Task> Run)> _pending = [];

    /// <summary>Every action registered, in order, whether or not it has run.</summary>
    public List<string> Enqueued { get; } = [];

    /// <summary>Every action that has actually run, in order.</summary>
    public List<string> Ran { get; } = [];

    public void Enqueue(string description, Func<CancellationToken, Task> action)
    {
        Enqueued.Add(description);
        _pending.Add((description, action));
    }

    public void Enqueue(string description, Action action)
        => Enqueue(description, _ =>
        {
            action();
            return Task.CompletedTask;
        });

    /// <summary>Stands in for the commit boundary draining the queue.</summary>
    public async Task RunPendingAsync()
    {
        var draining = _pending.ToArray();
        _pending.Clear();

        foreach (var (description, run) in draining)
        {
            Ran.Add(description);
            await run(CancellationToken.None);
        }
    }
}
