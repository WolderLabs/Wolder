using Microsoft.Extensions.DependencyInjection;

namespace DeGA.Core.Pipeline;

public class PipelineActionContextFactory(IServiceProvider serviceProvider) : IPipelineActionContextFactory
{
    public IPipelineActionContext Create() => 
        serviceProvider.GetRequiredService<IPipelineActionContext>();
}