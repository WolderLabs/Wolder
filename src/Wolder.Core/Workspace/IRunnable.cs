namespace Wolder.Core.Workspace;

public interface IInvokable<in TParameter, TOutput>
{
    Task<TOutput> InvokeAsync();
}

public interface IInvokable<TOutput>
{
    Task<TOutput> InvokeAsync();
}

public interface IVoidInvokable<in TParameter>
{
    Task InvokeAsync();
}

public interface IVoidInvokable
{
    Task InvokeAsync();
}
