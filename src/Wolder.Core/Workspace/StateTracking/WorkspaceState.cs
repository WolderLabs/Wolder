namespace Wolder.Core.Workspace.StateTracking;

public class WorkspaceState
{
    public InvokableNode? RootNode { get; private set; }
    
    public InvokableNode? CurrentNode { get; private set; }

    public InvocationNodeHandle InvokableNodeStarted(InvokableState invokableState)
    {
        var newNode = new InvokableNode()
        {
            Parent = CurrentNode,
            State = invokableState
        };
        
        if (RootNode is null)
        {
            RootNode = newNode; // Only set root for first invocation
        }
        else
        {
            if (CurrentNode is null)
            {
                throw new InvalidOperationException("Current node unexpectedly null");
            }
            CurrentNode.Children.Add(newNode);
        }
        CurrentNode = newNode;

        return new InvocationNodeHandle(this);
    }

    private void InvokableNodeEnded()
    {
        if (CurrentNode is null)
        {
            throw new InvalidOperationException("Current node unexpectedly null");
        }
        CurrentNode = CurrentNode.Parent ?? RootNode ?? throw new InvalidOperationException("Expected parent node to not be null");
    }
    
    public class InvocationNodeHandle : IDisposable
    {
        private readonly WorkspaceState _state;
        private bool _disposed;

        internal InvocationNodeHandle(WorkspaceState state)
        {
            _state = state;
        }

        public void Dispose()
        {
            if (!_disposed)
            {
                _disposed = true;
                _state.InvokableNodeEnded();
            }
        }
    }
}
