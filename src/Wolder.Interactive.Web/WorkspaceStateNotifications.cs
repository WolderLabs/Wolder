using Wolder.Core.Workspace;
using Wolder.Core.Workspace.Events;
using Wolder.Interactive.Web.Models;

namespace Wolder.Interactive.Web;

public class WorkspaceStateNotifications
{
    public WorkspaceStateNotifications()
    {
        Events = new()
        {
            WorkspaceInitializedAsync = WorkspaceInitializedAsync,
            InvocationBeginAsync = InvocationBeginAsync,
            InvocationEndAsync = InvocationEndAsync,
        };
    }

    internal WorkspaceStateEvents Events { get; }

    public event Action<InvocationDetail>? InvocationBegin;
    public event Action? WorkspaceInitialized;
    
    public Task WorkspaceInitializedAsync()
    {
        WorkspaceInitialized?.Invoke();
        return Task.CompletedTask;
    }

    public Task InvocationBeginAsync(InvocationBeginContext c)
    {
        InvocationBegin?.Invoke(new InvocationDetail(c.Invokable.GetType().Name));
        return Task.CompletedTask;
    }

    public Task InvocationEndAsync(InvocationEndContext c)
    {
        return Task.CompletedTask;
    }
}