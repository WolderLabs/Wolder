
namespace Wolder.Core.Pipeline;

public abstract class PipelineActionBase<TParameters> : IPipelineAction<TParameters>
    where TParameters : IActionDefinition
{
    private TParameters? Parameters { get; set; }

    public void SetParameters(IActionDefinition parameters)
    {
        if (Parameters is not null)
        {
            throw new InvalidOperationException("Parameters should only be set once for an action.");
        }
        
        if (parameters is not TParameters p)
        {
            throw new InvalidOperationException("Parameters not of the expected type");
        }
        
        Parameters = p;
    }

    public async Task ExecuteAsync(IPipelineActionContext context)
    {
        if (Parameters == null)
        {
            throw new InvalidOperationException("Execute called before parameters set");
        }
        await ExecuteAsync(context, Parameters);
    }

    protected abstract Task ExecuteAsync(IPipelineActionContext context, TParameters parameters);
}