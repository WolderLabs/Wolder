namespace Wolder.Core.Workspace;

public interface IWorkspaceStateDelegate
{
    Task InvocationBeginAsync(IInvokable invokable, object? parameters);
    Task InvocationEndAsync();
}