using Microsoft.Extensions.DependencyInjection;

namespace DeGA.Core
{
    public static class ServiceCollectionExtensions
    {
        public static DeGAServiceBuilder AddDeGA(this IServiceCollection services, string workspaceName)
        {
            services.AddTransient<IWorkspaceFileSystem, WorkspaceFileSystem>(s => new WorkspaceFileSystem(workspaceName));
            services.AddTransient<IWorkspaceAssistantCache, WorkspaceFileSystem>(s => new WorkspaceFileSystem(workspaceName));
            services.AddTransient<GeneratorWorkspace>();
            services.AddTransient<LayerActionFactory>();

            return new DeGAServiceBuilder(services);
        }
    }
}
