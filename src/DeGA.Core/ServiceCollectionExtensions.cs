using DeGA.Core.Assistants;
using DeGA.Core.Files;
using DeGA.Core.New;
using Microsoft.Extensions.DependencyInjection;

namespace DeGA.Core
{
    public static class ServiceCollectionExtensions
    {
        public static DeGAServiceBuilder AddDeGA(this IServiceCollection services)
        {
            services.AddSingleton<GeneratorPipelineBuilder>();

            services.AddScoped<ICacheFiles, CacheFiles>();
            services.AddScoped<ISourceFiles, SourceFiles>();
            services.AddSingleton<IAIAssistantCacheStore, AIAssistantCacheStore>();

            return new DeGAServiceBuilder(services);
        }
    }
}
