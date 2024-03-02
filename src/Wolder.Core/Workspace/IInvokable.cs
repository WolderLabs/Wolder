namespace Wolder.Core.Workspace;

public interface IInvokable<in TParameter, TOutput> : IInvokable
    where TParameter : notnull
{
    Task<TOutput> InvokeAsync();
}

public interface IInvokable<TOutput> : IInvokable
{
    Task<TOutput> InvokeAsync();
}

public interface IVoidInvokable<in TParameter> : IInvokable
    where TParameter : notnull
{
    Task InvokeAsync();
}

public interface IVoidInvokable : IInvokable
{
    Task InvokeAsync();
}

/// <summary>
/// Marker interface
/// </summary>
public interface IInvokable 
{
}
