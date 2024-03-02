using Microsoft.Extensions.DependencyInjection;
using Wolder.Core.Workspace.Events;

namespace Wolder.Core.Workspace;

internal class InvocationMiddleware(IServiceProvider provider) : IInvoke
{
    private readonly WorkspaceStateEventDispatcher _stateDelegate = provider.GetRequiredService<WorkspaceStateEventDispatcher>();
    
    public async Task InvokeVoidAsync<TInvokable>()
        where TInvokable : IVoidInvokable
    {
        using var scope = provider.CreateScope();
        var invokable = ActivatorUtilities.CreateInstance<TInvokable>(scope.ServiceProvider);
        await _stateDelegate.Events.InvocationBeginAsync(new (invokable, null));
        await invokable.InvokeAsync();
        await _stateDelegate.Events.InvocationEndAsync(new (invokable));
    }
    
    public async Task InvokeVoidAsync<TInvokable, TParameter>(TParameter parameter)
        where TInvokable : IVoidInvokable<TParameter>
        where TParameter : notnull
    {
        var scope = provider.CreateScope();
        var invokable = ActivatorUtilities.CreateInstance<TInvokable>(scope.ServiceProvider, parameter);
        await _stateDelegate.Events.InvocationBeginAsync(new(invokable, parameter));
        await invokable.InvokeAsync();
        await _stateDelegate.Events.InvocationEndAsync(new(invokable));
    }
    
    public async Task<TOutput> InvokeAsync<TInvokable, TParameter, TOutput>(TParameter parameter)
        where TInvokable : IInvokable<TParameter, TOutput>
        where TParameter : notnull
    {
        var scope = provider.CreateScope();
        var invokable = ActivatorUtilities.CreateInstance<TInvokable>(scope.ServiceProvider, parameter);
        await _stateDelegate.Events.InvocationBeginAsync(new(invokable, parameter));
        var result = await invokable.InvokeAsync();
        await _stateDelegate.Events.InvocationEndAsync(new(invokable));
        return result;
    }
    
    public async Task<TOutput> InvokeAsync<TInvokable, TOutput>()
        where TInvokable : IInvokable<TOutput>
    {
        var scope = provider.CreateScope();
        var invokable = ActivatorUtilities.CreateInstance<TInvokable>(scope.ServiceProvider);
        await _stateDelegate.Events.InvocationBeginAsync(new(invokable, null));
        var result = await invokable.InvokeAsync();
        await _stateDelegate.Events.InvocationEndAsync(new(invokable));
        return result;
    }
}
