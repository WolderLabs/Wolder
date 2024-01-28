namespace DeGA.Core.New;

public class GeneratorPipeline(IPipelineContextFactory contextFactory)
{
    private readonly List<IPipelineStep> _actions = new();

    public GeneratorPipeline AddStep<TDefinition>(
        Func<IPipelineContext, TDefinition> parametersFactory)
        where TDefinition : IActionDefinition
    {
        _actions.Add(new PipelineStep<TDefinition>(parametersFactory));
        return this;
    }

    public Task RunAsync()
    {
        return Task.CompletedTask;
    }
}