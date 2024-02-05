using Microsoft.Extensions.DependencyInjection;

namespace Wolder.Core.Workspace;

public class PipelineActionContextFactory(IServiceProvider serviceProvider) : IPipelineActionContextFactory
{
    public IPipelineActionContext Create() => 
        serviceProvider.GetRequiredService<IPipelineActionContext>();
}