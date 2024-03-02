namespace Wolder.Core.Workspace.Events;

public class WorkspaceStateEventDispatcher
{
    internal WorkspaceStateEvents Events { get; }
    public ICollection<WorkspaceStateEvents> Delegates { get; } = new List<WorkspaceStateEvents>();

    public WorkspaceStateEventDispatcher()
    {
        Events = new WorkspaceStateEvents()
        {
            WorkspaceInitializedAsync = async () =>
                await Task.WhenAll(Delegates.Select(d =>
                    d.WorkspaceInitializedAsync())),
            WorkspaceRunEndAsync = async () =>
                await Task.WhenAll(Delegates.Select(d =>
                    d.WorkspaceRunEndAsync())),
            InvocationBeginAsync = async (c) => 
                await Task.WhenAll(Delegates.Select(d =>
                    d.InvocationBeginAsync(c))),
            InvocationEndAsync = async (c) =>
                await Task.WhenAll(Delegates.Select(d =>
                    d.InvocationEndAsync(c))),
        };
    }
}