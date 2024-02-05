namespace Wolder.Core.Workspace;

public interface IPipelineAction<TParameters> : IPipelineAction
    where TParameters : IActionDefinition
{
}

public interface IPipelineAction
{
    void SetParameters(IActionDefinition parameters);
    Task ExecuteAsync(IPipelineActionContext context);
}