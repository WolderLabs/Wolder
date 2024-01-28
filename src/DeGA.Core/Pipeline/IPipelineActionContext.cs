namespace DeGA.Core.Pipeline;

public class PipelineActionContext
{
    public Task WriteFileAsync(string path, string content)
    {
        return Task.CompletedTask;
    }

    public void AddAction<TParameters, TAction>(Func<IPipelineContext, TParameters> parametersFactory)
        where TParameters : IActionDefinition
        where TAction : IPipelineAction<TParameters>
    {

    }
}