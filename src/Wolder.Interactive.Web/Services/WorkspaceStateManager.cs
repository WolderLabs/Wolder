using Wolder.Core.Workspace.Events;
using Wolder.Interactive.Web.Models;

namespace Wolder.Interactive.Web.Services;

public class WorkspaceStateManager
{
    private TaskCompletionSource _proceedWhenUnpaused = new(); // Start paused
    public bool IsRunning = false;
    
    public WorkspaceStateManager()
    {
        Events = new()
        {
            WorkspaceInitializedAsync = WorkspaceInitializedAsync,
            WorkspaceRunEndAsync = WorkspaceRunEndAsync,
            InvocationBeginAsync = InvocationBeginAsync,
            InvocationEndAsync = InvocationEndAsync,
        };
    }

    internal WorkspaceStateEvents Events { get; }

    public void Pause()
    {
        if (IsRunning)
        {
            IsRunning = false;
            _proceedWhenUnpaused = new TaskCompletionSource();
        }
    }

    public void Resume()
    {
        if (!IsRunning)
        {
            IsRunning = true;
            _proceedWhenUnpaused.TrySetResult();
        }
    }
    
    public void Step()
    {
        var prevTcs = _proceedWhenUnpaused;
        _proceedWhenUnpaused = new TaskCompletionSource();
        prevTcs.TrySetResult();
    }

    public event Action<InvocationBeginContext>? InvocationBegin;
    public event Action? WorkspaceInitialized;
    
    private async Task WorkspaceInitializedAsync()
    {
        WorkspaceInitialized?.Invoke();
        await _proceedWhenUnpaused.Task;
    }

    private async Task InvocationBeginAsync(InvocationBeginContext c)
    {
        InvocationBegin?.Invoke(c);
        await _proceedWhenUnpaused.Task;
    }
    
    private async Task WorkspaceRunEndAsync()
    {
        Pause();
        await _proceedWhenUnpaused.Task;
    }

    private Task InvocationEndAsync(InvocationEndContext c)
    {
        return Task.CompletedTask;
    }
}