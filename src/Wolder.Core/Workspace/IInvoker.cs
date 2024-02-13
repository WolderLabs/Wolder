namespace Wolder.Core.Workspace;

public interface IInvoker // I don't love this name
{
    Task InvokeVoidAsync<TInvokable>()
        where TInvokable : IVoidInvokable;

    Task InvokeAsync<TInvokable, TParameter>(TParameter parameter)
        where TInvokable : IVoidInvokable<TParameter>
        where TParameter : notnull;

    Task<TOutput> InvokeAsync<TInvokable, TParameter, TOutput>(TParameter parameter)
        where TInvokable : IInvokable<TParameter, TOutput>
        where TParameter : notnull;

    Task<TOutput> InvokeAsync<TInvokable, TOutput>()
        where TInvokable : IInvokable<TOutput>;
}