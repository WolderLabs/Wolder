namespace Wolder.Core.Workspace.StateTracking;

public record InvokableState(IInvokable Invokable, object? Parameter)
{
    public object? Result { get; internal set; }
}