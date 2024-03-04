using Wolder.Core.Workspace.StateTracking;

namespace Wolder.Core.Workspace.Events;

public record InvocationEndContext(
    InvokableState InvokableState, WorkspaceState WorkspaceState)
{
    
}