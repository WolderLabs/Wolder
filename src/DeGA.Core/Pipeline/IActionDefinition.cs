namespace DeGA.Core.Pipeline;

public interface IActionDefinition
{
}
    
public interface IActionDefinition<TAction> : IActionDefinition
    where TAction : IPipelineAction
{
}