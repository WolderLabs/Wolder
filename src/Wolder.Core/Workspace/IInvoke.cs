namespace Wolder.Core.Workspace;

public interface IInvoke
{
}

public interface IInvokeVoid<TRunnable> : IInvoke
    where TRunnable : IVoidInvokable
{
    Task InvokeAsync();
}

public interface IInvokeVoid<TRunnable, in TParameter> : IInvoke
    where TRunnable : IVoidInvokable<TParameter>
    where TParameter : notnull
{
    Task InvokeAsync(TParameter parameters);
}

public interface IInvoke<TRunnable, in TParameter, TOutput> : IInvoke
    where TRunnable : IInvokable<TParameter, TOutput>
    where TParameter : notnull
{
    Task<TOutput> InvokeAsync(TParameter parameter);
}

public interface IInvoke<TRunnable, TOutput> : IInvoke
    where TRunnable : IInvokable<TOutput>
{
    Task<TOutput> InvokeAsync();
}
