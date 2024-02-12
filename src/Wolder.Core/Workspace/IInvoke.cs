namespace Wolder.Core.Workspace;

public interface IInvoke
{
}

public interface IInvokeVoid<TRunnable> : IInvoke
    where TRunnable : IVoidInvokable
{
    Task InvokeAsync();
}

public interface IInvokeVoid<TRunnable, in TParameters> : IInvoke
    where TRunnable : IVoidInvokable<TParameters>
{
    Task InvokeAsync(TParameters parameters);
}

public interface IInvoke<TRunnable, in TParameter, TOutput> : IInvoke
    where TRunnable : IInvokable<TParameter, TOutput>
{
    Task<TOutput> InvokeAsync(TParameter parameter);
}

public interface IInvoke<TRunnable, TOutput> : IInvoke
    where TRunnable : IInvokable<TOutput>
{
    Task<TOutput> InvokeAsync();
}
