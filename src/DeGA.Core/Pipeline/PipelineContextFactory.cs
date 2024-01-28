using Microsoft.Extensions.DependencyInjection;

namespace DeGA.Core.New;

internal sealed class PipelineContextFactory(IServiceProvider services)
    : IPipelineContextFactory
{
    public IPipelineContext Create()
    {
        return services.GetRequiredService<IPipelineContext>();
    }
}