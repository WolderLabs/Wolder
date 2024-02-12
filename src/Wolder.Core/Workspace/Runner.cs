namespace Wolder.Core.Workspace;

internal class Runner<TRunnable> : IInvokeVoid<TRunnable> 
    where TRunnable : IVoidInvokable
{
    public Task InvokeAsync()
    {
        return Task.CompletedTask;
    }
}

internal class Runner<TRunnable, TParameter, TOutput> : IInvoke<TRunnable, TParameter, TOutput>
    where TRunnable : IInvokable<TParameter, TOutput>
{
    public Task<TOutput> InvokeAsync(TParameter parameter)
    {
        throw new NotImplementedException();
    }
}

internal class Runner<TRunnable, TOutput> : IInvoke<TRunnable, TOutput>
    where TRunnable : IInvokable<TOutput>
{
    public Task<TOutput> InvokeAsync() => 
        throw new NotImplementedException();
}
