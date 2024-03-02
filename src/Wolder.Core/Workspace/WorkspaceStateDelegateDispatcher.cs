namespace Wolder.Core.Workspace;

public class WorkspaceStateDelegateDispatcher : IWorkspaceStateDelegate
{
    public ICollection<IWorkspaceStateDelegate> Delegates = new List<IWorkspaceStateDelegate>();

    public async Task InvocationBeginAsync(IInvokable invokable, object? parameter)
    {
        await Task.WhenAll(Delegates.Select(d => 
            d.InvocationBeginAsync(invokable, parameter)));
    }

    public async Task InvocationEndAsync()
    {
        await Task.WhenAll(Delegates.Select(d => 
            d.InvocationEndAsync()));
    }
}