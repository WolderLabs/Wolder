using Microsoft.Extensions.DependencyInjection;

namespace DeGA.Core
{
    public static class ServiceCollectionExtensions
    {
        public static DeGAServiceBuilder AddDeGA(this IServiceCollection services, string workspaceName)
        {
            services.AddSingleton<GeneratorWorkspace>(s =>
            {
                var fs = new WorkspaceFileSystem(workspaceName);
                return new GeneratorWorkspace(fs, fs);
            });

            return new DeGAServiceBuilder(services);
        }
    }
}
