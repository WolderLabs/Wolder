
using DeGA.Core.Files;
using Microsoft.Extensions.DependencyInjection;

namespace DeGA.Core.New
{
    public class GeneratorPipelineBuilder(IServiceProvider services)
    {
        public GeneratorPipeline Build(string rootPath)
        {
            var fileSystem = ActivatorUtilities.CreateInstance<WorkspaceFileSystem>(
                services, rootPath);

            return ActivatorUtilities.CreateInstance<GeneratorPipeline>(
                services, fileSystem);
        }
    }
}
