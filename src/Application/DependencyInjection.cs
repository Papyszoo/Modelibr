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
            services.AddScoped<IFileProcessingService, FileProcessingService>();
            return services;
        }

        private static IServiceCollection AddMediator(this IServiceCollection services)
        {
            Assembly assembly = Assembly.GetExecutingAssembly();

            services.RegisterHandlersForInterfaceTypes(assembly, [typeof(IQueryHandler<,>), typeof(ICommandHandler<>), typeof(ICommandHandler<,>)]);

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
    }
}
