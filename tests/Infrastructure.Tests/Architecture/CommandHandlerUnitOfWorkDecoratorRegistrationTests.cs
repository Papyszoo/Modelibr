using Application;
using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Repositories;
using Application.ModelCategories;
using Application.TextureSets;
using Microsoft.Extensions.DependencyInjection;
using Moq;
using Xunit;

namespace Infrastructure.Tests.Architecture;

/// <summary>
/// Fitness gate for CommandHandlerUnitOfWorkDecorator (the commit-on-success
/// structural safety net added alongside prompt 25's unit-of-work migration):
/// every ICommandHandler registration resolved from the Application DI
/// container must come back wrapped by the decorator, not the bare handler.
/// If a future change to Application.DependencyInjection ever reverts to the
/// plain assembly-scan registration for command handlers (e.g. by merging the
/// command-handler scan back into RegisterHandlersForInterfaceTypes), this
/// fails loudly instead of silently reintroducing the
/// forgot-to-commit / commit-only-on-a-conditional-branch bug class.
/// </summary>
public class CommandHandlerUnitOfWorkDecoratorRegistrationTests
{
    [Fact]
    public void AllCommandHandlerRegistrations_UseTheDecoratorFactory_NotDirectTypeMapping()
    {
        // Direct type mapping (ImplementationType set, ImplementationFactory
        // null) is exactly how query/domain-event handlers — and, before this
        // safety net existed, command handlers too — get registered. Command
        // handlers must instead go through a factory (see
        // Application.DependencyInjection.RegisterCommandHandlersWithUnitOfWorkDecorator),
        // which is the only registration path that can wrap the resolved
        // instance in CommandHandlerUnitOfWorkDecorator.
        var services = new ServiceCollection();
        services.AddApplication();

        var commandHandlerDescriptors = services
            .Where(d => d.ServiceType.IsGenericType &&
                (d.ServiceType.GetGenericTypeDefinition() == typeof(ICommandHandler<>) ||
                 d.ServiceType.GetGenericTypeDefinition() == typeof(ICommandHandler<,>)))
            .ToList();

        // Sanity check that the scan actually found the many command handlers
        // in the assembly — an empty list here would make the assertion below
        // vacuously true and hide a totally broken registration.
        Assert.True(commandHandlerDescriptors.Count > 50,
            $"Expected many ICommandHandler<> registrations from assembly scan, found {commandHandlerDescriptors.Count}. " +
            "Did AddMediator stop scanning command handlers?");

        var notFactoryBased = commandHandlerDescriptors
            .Where(d => d.ImplementationFactory is null)
            .Select(d => d.ServiceType.ToString())
            .ToList();

        Assert.True(notFactoryBased.Count == 0,
            "The following command handler registrations bypass the commit-on-success " +
            "decorator (registered by direct type mapping instead of the decorator " +
            "factory in Application.DependencyInjection): " + string.Join(", ", notFactoryBased) +
            ". A handler resolved this way would run without the IUnitOfWork safety net.");
    }

    [Fact]
    public void QueryHandlerRegistrations_UseDirectTypeMapping_NotTheDecoratorFactory()
    {
        // The inverse check: query handlers must NOT go through the
        // command-handler decorator path — a query silently committing by
        // default would hide side effects query handlers must never have.
        var services = new ServiceCollection();
        services.AddApplication();

        var queryHandlerDescriptors = services
            .Where(d => d.ServiceType.IsGenericType &&
                d.ServiceType.GetGenericTypeDefinition() == typeof(IQueryHandler<,>))
            .ToList();

        Assert.True(queryHandlerDescriptors.Count > 20,
            $"Expected many IQueryHandler<,> registrations from assembly scan, found {queryHandlerDescriptors.Count}.");

        Assert.All(queryHandlerDescriptors, d => Assert.NotNull(d.ImplementationType));
        Assert.All(queryHandlerDescriptors, d => Assert.Null(d.ImplementationFactory));
    }

    [Fact]
    public void CommandHandler_NoResponseArity_ResolvesToUnitOfWorkDecorator()
    {
        // End-to-end proof for the ICommandHandler<TCommand> arity: resolve a
        // real, minimal-dependency handler (DeleteModelCategoryCommandHandler
        // needs only IModelCategoryRepository + IUnitOfWork) through the
        // actual Application DI container and check the runtime type of what
        // comes back is the decorator, not the bare handler.
        var services = new ServiceCollection();
        services.AddApplication();
        services.AddScoped(_ => new Mock<IModelCategoryRepository>().Object);
        services.AddScoped(_ => new Mock<IUnitOfWork>().Object);

        using var provider = services.BuildServiceProvider();
        var handler = provider.GetRequiredService<ICommandHandler<DeleteModelCategoryCommand>>();

        Assert.True(handler.GetType().IsGenericType);
        Assert.Equal(typeof(CommandHandlerUnitOfWorkDecorator<>), handler.GetType().GetGenericTypeDefinition());
    }

    [Fact]
    public void CommandHandler_WithResponseArity_ResolvesToUnitOfWorkDecorator()
    {
        // Same proof for the ICommandHandler<TCommand,TResponse> arity, using
        // HardDeleteTextureSetCommandHandler (needs only ITextureSetRepository
        // + IUnitOfWork).
        var services = new ServiceCollection();
        services.AddApplication();
        services.AddScoped(_ => new Mock<ITextureSetRepository>().Object);
        services.AddScoped(_ => new Mock<IUnitOfWork>().Object);

        using var provider = services.BuildServiceProvider();
        var handler = provider
            .GetRequiredService<ICommandHandler<HardDeleteTextureSetCommand, HardDeleteTextureSetResponse>>();

        Assert.True(handler.GetType().IsGenericType);
        Assert.Equal(typeof(CommandHandlerUnitOfWorkDecorator<,>), handler.GetType().GetGenericTypeDefinition());
    }
}
