namespace Wolder.Core.Workspace;

public interface IActionDefinition
{
}
    
public interface IActionDefinition<TAction> : IActionDefinition
    where TAction : IPipelineAction
{
}