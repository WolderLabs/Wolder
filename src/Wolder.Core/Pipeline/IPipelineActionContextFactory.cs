namespace Wolder.Core.Pipeline;

public interface IPipelineActionContextFactory
{
    IPipelineActionContext Create();
}