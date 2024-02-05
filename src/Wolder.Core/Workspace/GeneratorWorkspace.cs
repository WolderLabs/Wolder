namespace Wolder.Core.Workspace;

public class GeneratorWorkspace : IDisposable
{
    private bool _isDisposed;
        
    public event Action? Disposing;

    public GeneratorWorkspace()
    {
    }
    
    public async Task RunOrchestrationAsync<TOrchestration>()
        where TOrchestration : IOrchestration
    {
        throw new NotImplementedException();
    }

    public void Dispose()
    {
        if (!_isDisposed)
        {
            _isDisposed = true;
            Disposing?.Invoke();
        }
    }
}