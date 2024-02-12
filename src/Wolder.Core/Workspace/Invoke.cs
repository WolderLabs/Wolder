using Microsoft.Extensions.DependencyInjection;

namespace Wolder.Core.Workspace;

internal class InvokeVoid<TInvokable>(IServiceProvider provider) : IInvokeVoid<TInvokable> 
    where TInvokable : IVoidInvokable
{
    public async Task InvokeAsync()
    {
        var scope = provider.CreateScope();
        var invokable = ActivatorUtilities.CreateInstance<TInvokable>(scope.ServiceProvider);
        await invokable.InvokeAsync();
    }
}

internal class Invoke<TInvokable, TParameter, TOutput>(IServiceProvider provider) : IInvoke<TInvokable, TParameter, TOutput>
    where TInvokable : IInvokable<TParameter, TOutput>
    where TParameter : notnull
{
    public async Task<TOutput> InvokeAsync(TParameter parameter)
    {
        var scope = provider.CreateScope();
        var invokable = ActivatorUtilities.CreateInstance<TInvokable>(scope.ServiceProvider, parameter);
        return await invokable.InvokeAsync();
    }
}

internal class InvokeVoid<TInvokable, TParameter>(IServiceProvider provider) : IInvokeVoid<TInvokable, TParameter>
    where TInvokable : IVoidInvokable<TParameter>
    where TParameter : notnull
{
    public async Task InvokeAsync(TParameter parameter)
    {
        var scope = provider.CreateScope();
        var invokable = ActivatorUtilities.CreateInstance<TInvokable>(scope.ServiceProvider, parameter);
        await invokable.InvokeAsync();
    }
}

internal class Invoke<TInvokable, TOutput>(IServiceProvider provider) : IInvoke<TInvokable, TOutput>
    where TInvokable : IInvokable<TOutput>
{
    public async Task<TOutput> InvokeAsync()
    {
        var scope = provider.CreateScope();
        var invokable = ActivatorUtilities.CreateInstance<TInvokable>(scope.ServiceProvider);
        return await invokable.InvokeAsync();
    }
}
