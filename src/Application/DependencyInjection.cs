using Application.Abstractions;
using Application.Abstractions.Messaging;
using Application.Abstractions.Services;
using Application.Services;
using Domain.Services;
using Microsoft.Extensions.DependencyInjection;
using System.Reflection;

namespace Application
{
    public static class DependencyInjection
    {
        public static IServiceCollection AddApplication(this IServiceCollection services)
        {
            services.AddMediator();
            services.AddScoped<IFileUtilityService, FileUtilityService>();
            services.AddScoped<IDateTimeProvider, DateTimeProvider>();
            services.AddScoped<IFileCreationService, FileCreationService>();
            services.AddScoped<Application.Agents.IAgentAudit, Application.Agents.AgentAudit>();
            services.AddScoped<Application.Agents.IAgentOperationReverser, Application.Agents.AgentOperationReverser>();
            services.AddScoped<Application.Settings.ISettingsService, Application.Settings.SettingsService>();

            // Store importer (v0.5 prompt 05): the orchestrator and its 1:1 handler adapter.
            // The HTTP client, queue and progress notifier are infrastructure/host concerns
            // and are registered in Infrastructure/WebApi.
            services.AddScoped<Application.StoreImports.IStoreImportSink, Application.StoreImports.StoreImportSink>();
            services.AddScoped<Application.StoreImports.IStoreImportCategoryResolver, Application.StoreImports.StoreImportCategoryResolver>();
            services.AddScoped<Application.StoreImports.IStoreImportProcessor, Application.StoreImports.StoreImportProcessor>();
            return services;
        }

        private static IServiceCollection AddMediator(this IServiceCollection services)
        {
            Assembly assembly = Assembly.GetExecutingAssembly();

            // Query handlers and domain-event handlers are registered by direct
            // type mapping - a plain constructor call, nothing wraps them.
            services.RegisterHandlersForInterfaceTypes(assembly, [typeof(IQueryHandler<,>), typeof(IDomainEventHandler<>)]);

            // Command handlers go through the commit-on-success decorator
            // instead (see CommandHandlerUnitOfWorkDecorator) - this is the
            // structural guarantee that a successful command always commits,
            // even if the handler forgot to call IUnitOfWork itself.
            services.RegisterCommandHandlersWithUnitOfWorkDecorator(assembly);

            return services;
        }

        private static void RegisterHandlersForInterfaceTypes(this IServiceCollection services, Assembly assembly, IEnumerable<Type> interfaceTypes)
        {
            var handlerTypes = assembly.GetTypes()
                .Where(t => !t.IsAbstract && !t.IsInterface)
                .SelectMany(t => t.GetInterfaces(), (t, i) => new { Type = t, Interface = i })
                .Where(ti => ti.Interface.IsGenericType && interfaceTypes.Any(it => it == ti.Interface.GetGenericTypeDefinition()))
                .Select(ti => new { ImplementationType = ti.Type, ServiceType = ti.Interface });

            foreach (var handler in handlerTypes)
            {
                services.AddScoped(handler.ServiceType, handler.ImplementationType);
            }
        }

        /// <summary>
        /// Registers every ICommandHandler&lt;TCommand&gt; / ICommandHandler&lt;TCommand,TResponse&gt;
        /// implementation found via assembly scan, wrapped in
        /// CommandHandlerUnitOfWorkDecorator&lt;...&gt;. The concrete handler type
        /// is also registered under itself - that's what the decorator's
        /// factory below resolves as "the real handler"; asking the container
        /// to inject the handler's own service interface from inside its own
        /// factory would just recurse into the decorator again.
        /// </summary>
        private static void RegisterCommandHandlersWithUnitOfWorkDecorator(this IServiceCollection services, Assembly assembly)
        {
            var commandHandlerInterfaceDefinitions = new[] { typeof(ICommandHandler<>), typeof(ICommandHandler<,>) };

            var handlerTypes = assembly.GetTypes()
                .Where(t => !t.IsAbstract && !t.IsInterface)
                .SelectMany(t => t.GetInterfaces(), (t, i) => new { ImplementationType = t, ServiceType = i })
                .Where(ti => ti.ServiceType.IsGenericType
                    && commandHandlerInterfaceDefinitions.Contains(ti.ServiceType.GetGenericTypeDefinition()));

            foreach (var handler in handlerTypes)
            {
                var implementationType = handler.ImplementationType;
                var serviceType = handler.ServiceType;

                // The concrete handler, resolvable by its own type.
                services.AddScoped(implementationType);

                var genericArgs = serviceType.GetGenericArguments();
                var decoratorOpenType = genericArgs.Length == 1
                    ? typeof(CommandHandlerUnitOfWorkDecorator<>)
                    : typeof(CommandHandlerUnitOfWorkDecorator<,>);
                var decoratorType = decoratorOpenType.MakeGenericType(genericArgs);

                services.AddScoped(serviceType, sp =>
                {
                    var inner = sp.GetRequiredService(implementationType);
                    var unitOfWork = sp.GetRequiredService<IUnitOfWork>();
                    return Activator.CreateInstance(decoratorType, inner, unitOfWork)
                        ?? throw new InvalidOperationException($"Failed to construct {decoratorType} for {serviceType}.");
                });
            }
        }
    }
}
