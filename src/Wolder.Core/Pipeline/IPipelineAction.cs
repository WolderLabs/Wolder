namespace Wolder.Core.Pipeline;

public interface IPipelineAction<TParameters> : IPipelineAction
    where TParameters : IActionDefinition
{
}

public interface IPipelineAction
{
    void SetParameters(IActionDefinition parameters);
    Task ExecuteAsync(IPipelineActionContext context);
}