namespace DeGA.Core.Pipeline;

internal record PipelineStep<TDefinition>(
    Func<IPipelineContext, TDefinition> DefinitionFactory) : IPipelineStep
    where TDefinition : IActionDefinition
{

}