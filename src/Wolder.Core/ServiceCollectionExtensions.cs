using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Wolder.Core.Assistants;
using Wolder.Core.Files;
using Wolder.Core.Workspace;

namespace Wolder.Core;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddWolder(this IServiceCollection services, IConfigurationSection config)
    {
        services.AddTransient<GeneratorWorkspaceBuilder>(s =>
            ActivatorUtilities.CreateInstance<GeneratorWorkspaceBuilder>(s, config));

        return services;
    }
}