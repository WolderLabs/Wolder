namespace Wolder.Core.Workspace;

public interface IOrchestration
{
    Task<IOrchestrationWorkspaceState> RunAsync(
        IOrchestrationWorkspaceState initialState);
}

public interface IOrchestration<TOptions>
{
    Task<IOrchestrationWorkspaceState> RunAsync(
        IOrchestrationWorkspaceState initialState,
        TOptions options);
}