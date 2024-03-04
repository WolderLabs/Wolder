using Wolder.Core.Workspace.StateTracking;

namespace Wolder.Core.Workspace.Events;

public record InvocationBeginContext(
    InvokableState InvokableState, WorkspaceState WorkspaceState)
{
}