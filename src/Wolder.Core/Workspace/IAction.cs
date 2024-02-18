namespace Wolder.Core.Workspace;

public interface IVoidAction<in TParameter> : IVoidInvokable<TParameter>, IInvokableAction
    where TParameter : notnull
{
}

public interface IAction<TOutput> : IInvokable<TOutput>, IInvokableAction
{
}

public interface IAction<in TParameter, TOutput> : IInvokable<TParameter, TOutput>, IInvokableAction
    where TParameter : notnull
{
}

public interface IVoidAction : IVoidInvokable, IInvokableAction
{
}

public interface IInvokableAction
{
}