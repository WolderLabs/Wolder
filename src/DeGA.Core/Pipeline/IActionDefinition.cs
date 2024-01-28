namespace DeGA.Core.New
{
    public interface IActionDefinition
    {
    }
    
    public interface IActionDefinition<TAction> : IActionDefinition
        where TAction : IPipelineAction
    {
    }
}