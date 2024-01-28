namespace DeGA.Core.Pipeline;

public interface IPipelineAction<TParameters> : IPipelineAction
    where TParameters : IActionDefinition
{
    void SetParameters(TParameters parameters);
}

public interface IPipelineAction
{
    Task ExecuteAsync(PipelineActionContext context);
}