namespace Wolder.Core.Workspace;

public interface IVoidAction<in TParameter> : IVoidInvokable<TParameter>
{
}

public interface IAction<TOutput> : IInvokable<TOutput>
{
}

public interface IAction<in TParameter, TOutput> : IInvokable<TParameter, TOutput>
{
}

public interface IVoidAction : IVoidInvokable
{
}