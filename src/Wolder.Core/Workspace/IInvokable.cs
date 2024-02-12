namespace Wolder.Core.Workspace;

public interface IInvokable<in TParameter, TOutput>
    where TParameter : notnull
{
    Task<TOutput> InvokeAsync();
}

public interface IInvokable<TOutput>
{
    Task<TOutput> InvokeAsync();
}

public interface IVoidInvokable<in TParameter>
    where TParameter : notnull
{
    Task InvokeAsync();
}

public interface IVoidInvokable
{
    Task InvokeAsync();
}
