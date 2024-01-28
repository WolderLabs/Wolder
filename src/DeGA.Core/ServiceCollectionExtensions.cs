using DeGA.Core.Assistant;
using DeGA.Core.Files;
using DeGA.Core.New;
using Microsoft.Extensions.DependencyInjection;

namespace DeGA.Core
{
    public static class ServiceCollectionExtensions
    {
        public static DeGAServiceBuilder AddDeGA(this IServiceCollection services, string workspaceName)
        {
            services.AddScoped<ICacheFiles, CacheFiles>();
            services.AddScoped<ICacheFiles, CacheFiles>();
            services.AddSingleton<IAIAssistantCacheStore, WorkspacA>();
            services.AddSingleton<IWorkspaceCommandLine, WorkspaceCommandLine>();
            services.AddSingleton<GeneratorWorkspace>();

            return new DeGAServiceBuilder(services);
        }
        
        public static DeGAServiceBuilder AddDeGA(this IServiceCollection services)
        {
            services.AddSingleton<GeneratorPipelineBuilder>();

            return new DeGAServiceBuilder(services);
        }
    }
}
