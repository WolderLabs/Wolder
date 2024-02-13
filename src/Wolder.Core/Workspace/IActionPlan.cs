namespace Wolder.Core.Workspace;

public interface IVoidActionPlan<in TParameter> : IVoidInvokable<TParameter>, IInvokableActionPlan
    where TParameter : notnull
{
}

public interface IActionPlan<TOutput> : IInvokable<TOutput>, IInvokableActionPlan
{
}

public interface IActionPlan<in TParameter, TOutput> : IInvokable<TParameter, TOutput>, IInvokableActionPlan
    where TParameter : notnull
{
}

public interface IVoidActionPlan : IVoidInvokable, IInvokableActionPlan
{
}

public interface IInvokableActionPlan
{
}