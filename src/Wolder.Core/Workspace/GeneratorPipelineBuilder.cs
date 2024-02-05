using Microsoft.Extensions.DependencyInjection;
using Wolder.Core.Files;

namespace Wolder.Core.Workspace;

public class GeneratorPipelineBuilder(IServiceProvider services)
{
    public GeneratorPipeline Build(string rootPath)
    {
        var scope = services.CreateScope();

        var rootPathService = scope.ServiceProvider.GetRequiredService<PipelineRootPath>();
        rootPathService.SetRootPath(rootPath);

        var pipeline = scope.ServiceProvider.GetRequiredService<GeneratorPipeline>();
        pipeline.Disposing += () => scope.Dispose();
        
        return pipeline;
    }
}