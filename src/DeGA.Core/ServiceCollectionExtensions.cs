using DeGA.Core.Assistants;
using DeGA.Core.Files;
using DeGA.Core.Pipeline;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace DeGA.Core;

public static class ServiceCollectionExtensions
{
    public static DeGAServiceBuilder AddDeGA(this IServiceCollection services, IConfigurationSection config)
    {
        services.AddSingleton<GeneratorPipelineBuilder>();

        services.AddScoped<ICacheFiles, CacheFiles>();
        services.AddScoped<ISourceFiles, SourceFiles>();
        services.AddSingleton<IAIAssistantCacheStore, AIAssistantCacheStore>();

        return new DeGAServiceBuilder(services, config);
    }
}