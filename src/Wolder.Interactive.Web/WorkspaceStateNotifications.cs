using Wolder.Core.Workspace;
using Wolder.Interactive.Web.Models;

namespace Wolder.Interactive.Web;

public class WorkspaceStateNotifications : IWorkspaceStateDelegate
{
    public event Action<InvocationDetail>? InvocationBegin;
    public Task InvocationBeginAsync(IInvokable invokable, object? parameters)
    {
        InvocationBegin?.Invoke(new InvocationDetail(invokable.GetType().Name));
        return Task.CompletedTask;
    }

    public Task InvocationEndAsync()
    {
        return Task.CompletedTask;
    }
}