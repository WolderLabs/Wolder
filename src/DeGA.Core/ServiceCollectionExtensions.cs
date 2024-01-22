using Microsoft.Extensions.DependencyInjection;

namespace DeGA.Core
{
    public static class ServiceCollectionExtensions
    {
        public static DeGAServiceBuilder AddDeGA(this IServiceCollection services, string workspaceName)
        {
            var fs = new WorkspaceFileSystem(workspaceName);
            services.AddSingleton<IWorkspaceFileSystem>(fs);
            services.AddSingleton<IWorkspaceAssistantCache>(fs);
            services.AddSingleton<IWorkspaceCommandLine, WorkspaceCommandLine>();
            services.AddSingleton<GeneratorWorkspace>();

            return new DeGAServiceBuilder(services);
        }
    }
}
