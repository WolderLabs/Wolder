namespace Wolder.Core.Workspace.Events;

public record InvocationBeginContext(
    IInvokable Invokable, object? Parameter)
{
}