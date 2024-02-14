namespace Wolder.Core.Workspace;

public interface IInvokeThing
{
}

public interface IInvokeVoid<TRunnable> : IInvokeThing
    where TRunnable : IVoidInvokable
{
    Task InvokeAsync();
}

public interface IInvokeVoid<TRunnable, in TParameter> : IInvokeThing
    where TRunnable : IVoidInvokable<TParameter>
    where TParameter : notnull
{
    Task InvokeAsync(TParameter parameters);
}

public interface IInvoke<TRunnable, in TParameter, TOutput> : IInvokeThing
    where TRunnable : IInvokable<TParameter, TOutput>
    where TParameter : notnull
{
    Task<TOutput> InvokeAsync(TParameter parameter);
}

public interface IInvoke<TRunnable, TOutput> : IInvokeThing
    where TRunnable : IInvokable<TOutput>
{
    Task<TOutput> InvokeAsync();
}
