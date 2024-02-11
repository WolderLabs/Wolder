namespace Wolder.Core.Workspace;

public interface IRun<TRunnable>
    where TRunnable : IRunnable
{
    Task InvokeAsync();
}

public interface IRun<TRunnable, in TParameter, TOutput>
    where TRunnable : IRunnable<TParameter, TOutput>
{
    Task<TOutput> InvokeAsync(TParameter parameter);
}

public interface IRun<TRunnable, TOutput>
    where TRunnable : IRunnable<TOutput>
{
    Task<TOutput> InvokeAsync();
}