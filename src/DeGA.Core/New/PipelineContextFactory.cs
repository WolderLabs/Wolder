using Microsoft.Extensions.DependencyInjection;

namespace DeGA.Core.New;

internal class PipelineContextFactory(IServiceProvider services)
{
    public IPipelineContext Create()
    {
        return services.GetRequiredService<IPipelineContext>();
    }
}
