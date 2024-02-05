namespace Wolder.Core.Workspace;

public interface IOrchestrationWorkspaceState
{
    Task<IOrchestrationWorkspaceState> RunOrchestrationAsync<TOrchestration>()
        where TOrchestration : IOrchestration;

    Task<IOrchestrationWorkspaceState> RunOrchestrationAsync<TOrchestration, TOptions>(
        TOptions options)
        where TOrchestration : IOrchestration<TOptions>
        where TOptions : notnull;
    
    Task<IOrchestrationWorkspaceState> RunActivityAsync<TActivity>()
        where TActivity : IActivity;

    Task<IOrchestrationWorkspaceState> RunActivityAsync<TOrchestration, TOptions>(
        TOptions options)
        where TOrchestration : IActivity<TOptions>
        where TOptions : notnull;
}

public interface IActivity
{
}

public interface IActivity<TOptions>
{
}
