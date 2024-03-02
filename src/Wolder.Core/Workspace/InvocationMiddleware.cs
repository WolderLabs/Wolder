using Microsoft.Extensions.DependencyInjection;

namespace Wolder.Core.Workspace;

internal class InvocationMiddleware(IServiceProvider provider) : IInvoke
{
    private readonly IWorkspaceStateDelegate _stateDelegate = provider.GetRequiredService<IWorkspaceStateDelegate>();
    
    public async Task InvokeVoidAsync<TInvokable>()
        where TInvokable : IVoidInvokable
    {
        using var scope = provider.CreateScope();
        var invokable = ActivatorUtilities.CreateInstance<TInvokable>(scope.ServiceProvider);
        await _stateDelegate.InvocationBeginAsync(invokable, null);
        await invokable.InvokeAsync();
        await _stateDelegate.InvocationEndAsync();
    }
    
    public async Task InvokeVoidAsync<TInvokable, TParameter>(TParameter parameter)
        where TInvokable : IVoidInvokable<TParameter>
        where TParameter : notnull
    {
        var scope = provider.CreateScope();
        var invokable = ActivatorUtilities.CreateInstance<TInvokable>(scope.ServiceProvider, parameter);
        await _stateDelegate.InvocationBeginAsync(invokable, parameter);
        await invokable.InvokeAsync();
        await _stateDelegate.InvocationEndAsync();
    }
    
    public async Task<TOutput> InvokeAsync<TInvokable, TParameter, TOutput>(TParameter parameter)
        where TInvokable : IInvokable<TParameter, TOutput>
        where TParameter : notnull
    {
        var scope = provider.CreateScope();
        var invokable = ActivatorUtilities.CreateInstance<TInvokable>(scope.ServiceProvider, parameter);
        await _stateDelegate.InvocationBeginAsync(invokable, parameter);
        var result = await invokable.InvokeAsync();
        await _stateDelegate.InvocationEndAsync();
        return result;
    }
    
    public async Task<TOutput> InvokeAsync<TInvokable, TOutput>()
        where TInvokable : IInvokable<TOutput>
    {
        var scope = provider.CreateScope();
        var invokable = ActivatorUtilities.CreateInstance<TInvokable>(scope.ServiceProvider);
        await _stateDelegate.InvocationBeginAsync(invokable, null);
        var result = await invokable.InvokeAsync();
        await _stateDelegate.InvocationEndAsync();
        return result;
    }
}
