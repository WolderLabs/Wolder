namespace Wolder.Core.Workspace;

public class GeneratorWorkspace : IDisposable
{
    private bool _isDisposed;
        
    public event Action? Disposing;

    public GeneratorWorkspace()
    {
    }
    
    public async Task<WorkspaceState> RunOrchestrationAsync<TOrchestration>(
        WorkspaceState? inputState = null)
        where TOrchestration : IOrchestration
    {
        throw new NotImplementedException();
    }
    
    public async Task<WorkspaceState> RunOrchestrationAsync<TOrchestration, TOptions>(
        TOptions options,
        WorkspaceState? inputState = null)
        where TOrchestration : IOrchestration<TOptions>
        where TOptions : notnull
    {
        throw new NotImplementedException();
    }

    public Task SetOutputStateAsync(WorkspaceState workspaceState)
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