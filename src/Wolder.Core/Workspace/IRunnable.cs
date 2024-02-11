namespace Wolder.Core.Workspace;

public interface IRunnable
{
    Task InvokeAsync();
}

public interface IRunnable<in TParameter, TOutput>
{
    Task<TOutput> InvokeAsync();
}

public interface IRunnable<TOutput>
{
    Task<TOutput> InvokeAsync();
}
