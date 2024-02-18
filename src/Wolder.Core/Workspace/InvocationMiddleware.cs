using Microsoft.Extensions.DependencyInjection;

namespace Wolder.Core.Workspace;

internal class InvocationMiddleware(IServiceProvider provider) : IInvoke
{
    public async Task InvokeVoidAsync<TInvokable>()
        where TInvokable : IVoidInvokable
    {
        var scope = provider.CreateScope();
        var invokable = ActivatorUtilities.CreateInstance<TInvokable>(scope.ServiceProvider);
        await invokable.InvokeAsync();
    }
    
    public async Task InvokeVoidAsync<TInvokable, TParameter>(TParameter parameter)
        where TInvokable : IVoidInvokable<TParameter>
        where TParameter : notnull
    {
        var scope = provider.CreateScope();
        var invokable = ActivatorUtilities.CreateInstance<TInvokable>(scope.ServiceProvider, parameter);
        await invokable.InvokeAsync();
    }
    
    public async Task<TOutput> InvokeAsync<TInvokable, TParameter, TOutput>(TParameter parameter)
        where TInvokable : IInvokable<TParameter, TOutput>
        where TParameter : notnull
    {
        var scope = provider.CreateScope();
        var invokable = ActivatorUtilities.CreateInstance<TInvokable>(scope.ServiceProvider, parameter);
        return await invokable.InvokeAsync();
    }
    
    public async Task<TOutput> InvokeAsync<TInvokable, TOutput>()
        where TInvokable : IInvokable<TOutput>
    {
        var scope = provider.CreateScope();
        var invokable = ActivatorUtilities.CreateInstance<TInvokable>(scope.ServiceProvider);
        return await invokable.InvokeAsync();
    }
}
