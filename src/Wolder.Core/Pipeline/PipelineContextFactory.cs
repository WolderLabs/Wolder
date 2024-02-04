using Microsoft.Extensions.DependencyInjection;

namespace Wolder.Core.Pipeline;

internal sealed class PipelineContextFactory(IServiceProvider services)
    : IPipelineContextFactory
{
    public IPipelineContext Create()
    {
        return services.GetRequiredService<IPipelineContext>();
    }
}