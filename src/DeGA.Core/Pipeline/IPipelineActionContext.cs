namespace DeGA.Core.Pipeline;

public interface IPipelineActionContext
{
}

public class PipelineActionContext : IPipelineActionContext
{
    public void AddAction<TParameters, TAction>(Func<IPipelineContext, TParameters> parametersFactory)
        where TParameters : IActionDefinition
        where TAction : IPipelineAction<TParameters>
    {
    }
}