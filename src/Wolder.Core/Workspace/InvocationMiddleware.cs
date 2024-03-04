using Microsoft.Extensions.DependencyInjection;
using Wolder.Core.Workspace.Events;
using Wolder.Core.Workspace.StateTracking;

namespace Wolder.Core.Workspace;

internal class InvocationMiddleware : IInvoke
{
    private readonly WorkspaceStateEventDispatcher _stateDelegate;
    private readonly IServiceProvider _provider;
    private readonly WorkspaceState _state;

    public InvocationMiddleware(IServiceProvider provider)
    {
        _provider = provider;
        _stateDelegate = provider.GetRequiredService<WorkspaceStateEventDispatcher>();
        _state = provider.GetRequiredService<WorkspaceState>();
    }

    public async Task InvokeVoidAsync<TInvokable>()
        where TInvokable : IVoidInvokable
    {
        using var scope = _provider.CreateScope();
        var invokable = ActivatorUtilities.CreateInstance<TInvokable>(scope.ServiceProvider);
        var state = new InvokableState(invokable, null);
        using (var handle = _state.InvokableNodeStarted(state))
        {
            await _stateDelegate.Events.InvocationBeginAsync(new InvocationBeginContext(state, _state));
            await invokable.InvokeAsync();
        }
        await _stateDelegate.Events.InvocationEndAsync(new InvocationEndContext(state, _state));
    }
    
    public async Task InvokeVoidAsync<TInvokable, TParameter>(TParameter parameter)
        where TInvokable : IVoidInvokable<TParameter>
        where TParameter : notnull
    {
        var scope = _provider.CreateScope();
        var invokable = ActivatorUtilities.CreateInstance<TInvokable>(scope.ServiceProvider, parameter);
        var state = new InvokableState(invokable, parameter);
        using (var handle = _state.InvokableNodeStarted(state))
        {
            await _stateDelegate.Events.InvocationBeginAsync(new InvocationBeginContext(state, _state));
            await invokable.InvokeAsync();
        }
        await _stateDelegate.Events.InvocationEndAsync(new InvocationEndContext(state, _state));
    }
    
    public async Task<TOutput> InvokeAsync<TInvokable, TParameter, TOutput>(TParameter parameter)
        where TInvokable : IInvokable<TParameter, TOutput>
        where TParameter : notnull
    {
        var scope = _provider.CreateScope();
        var invokable = ActivatorUtilities.CreateInstance<TInvokable>(scope.ServiceProvider, parameter);
        var state = new InvokableState(invokable, parameter);
        TOutput result;
        using (var handle = _state.InvokableNodeStarted(state))
        {
            await _stateDelegate.Events.InvocationBeginAsync(new InvocationBeginContext(state, _state));
            result = await invokable.InvokeAsync();
            state.Result = result;
        }
        await _stateDelegate.Events.InvocationEndAsync(new InvocationEndContext(state, _state));
        return result;
    }
    
    public async Task<TOutput> InvokeAsync<TInvokable, TOutput>()
        where TInvokable : IInvokable<TOutput>
    {
        var scope = _provider.CreateScope();
        var invokable = ActivatorUtilities.CreateInstance<TInvokable>(scope.ServiceProvider);
        var state = new InvokableState(invokable, null);
        TOutput result;
        using (var handle = _state.InvokableNodeStarted(state))
        {
            await _stateDelegate.Events.InvocationBeginAsync(new InvocationBeginContext(state, _state));
            result = await invokable.InvokeAsync();
            state.Result = result;
        }
        await _stateDelegate.Events.InvocationEndAsync(new InvocationEndContext(state, _state));
        return result;
    }
}
