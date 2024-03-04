namespace Wolder.Core.Workspace.StateTracking;

public record InvokableNode
{
    public required InvokableState State { get; init; }
    public required InvokableNode? Parent { get; init; }
    public List<InvokableNode> Children { get; } = new();
}