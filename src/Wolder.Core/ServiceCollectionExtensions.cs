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
        services.AddTransient<GeneratorPipelineBuilder>(s =>
            ActivatorUtilities.CreateInstance<GeneratorPipelineBuilder>(s, config));

        return services;
    }
}