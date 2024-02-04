using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Wolder.Core.Assistants;
using Wolder.Core.Files;
using Wolder.Core.Pipeline;

namespace Wolder.Core;

public static class ServiceCollectionExtensions
{
    public static DeGAServiceBuilder AddDeGA(this IServiceCollection services, IConfigurationSection config)
    {
        services.AddSingleton<GeneratorPipelineBuilder>();

        services.AddScoped<PipelineRootPath>();
        services.AddScoped<ICacheFiles, CacheFiles>();
        services.AddScoped<ISourceFiles, SourceFiles>();
        services.AddScoped<GeneratorPipeline>();
        services.AddScoped<IAIAssistantCacheStore, AIAssistantCacheStore>();
        
        services.AddTransient<IPipelineContext, PipelineContext>();
        services.AddTransient<IPipelineActionContext, PipelineActionContext>();
        services.AddScoped<IPipelineContextFactory, PipelineContextFactory>();
        services.AddScoped<IPipelineActionContextFactory, PipelineActionContextFactory>();
        
        var builder = new DeGAServiceBuilder(services, config);
        services.AddScoped<ActionFactory>(s => 
            ActivatorUtilities.CreateInstance<ActionFactory>(s, builder.DefinitionToActionTypeMap));

        return builder;
    }
}