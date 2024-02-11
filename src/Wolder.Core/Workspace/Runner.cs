namespace Wolder.Core.Workspace;

internal class Runner<TRunnable> : IRun<TRunnable> 
    where TRunnable : IRunnable
{
    public Task InvokeAsync()
    {
        return Task.CompletedTask;
    }
}

internal class Runner<TRunnable, TParameter, TOutput> : IRun<TRunnable, TParameter, TOutput>
    where TRunnable : IRunnable<TParameter, TOutput>
{
    public Task<TOutput> InvokeAsync(TParameter parameter)
    {
        throw new NotImplementedException();
    }
}

internal class Runner<TRunnable, TOutput> : IRun<TRunnable, TOutput>
    where TRunnable : IRunnable<TOutput>
{
    public Task<TOutput> InvokeAsync() => 
        throw new NotImplementedException();
}
