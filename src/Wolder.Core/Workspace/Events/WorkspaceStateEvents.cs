namespace Wolder.Core.Workspace.Events;

public class WorkspaceStateEvents
{
    public Func<Task> WorkspaceInitializedAsync { get; set; } = () => Task.CompletedTask;
    public Func<InvocationBeginContext, Task> InvocationBeginAsync { get; set; } = (c) => Task.CompletedTask;
    public Func<InvocationEndContext, Task> InvocationEndAsync { get; set; } = (c) => Task.CompletedTask;
}